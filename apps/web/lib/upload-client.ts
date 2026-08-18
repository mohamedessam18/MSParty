export type Probe = { playable: boolean; duration: number; poster: string | null; reason?: string };

/**
 * Loads the file locally before a single byte is sent. Uploading two gigabytes
 * only to discover the browser cannot decode the codec is the worst outcome the
 * old flow allowed — it only warned on the file extension.
 */
export function probeVideo(file: File, timeoutMs = 20000): Promise<Probe> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    const finish = (result: Probe) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = window.setTimeout(
      () => finish({ playable: false, duration: 0, poster: null, reason: "الملف أخد وقت طويل في الفحص." }),
      timeoutMs
    );

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onerror = () => {
      window.clearTimeout(timer);
      finish({
        playable: false,
        duration: 0,
        poster: null,
        reason: "المتصفح مش قادر يشغّل الملف ده. غالبًا الترميز مش مدعوم — جرّب MP4 بترميز H.264."
      });
    };

    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      // A decodable container with no video track is audio-only, not a film.
      if (!video.videoWidth) {
        return finish({ playable: false, duration, poster: null, reason: "الملف ده مالوش مسار فيديو." });
      }
      // Grab a frame a little way in; frame zero is usually black.
      video.currentTime = Math.min(duration * 0.1 || 1, 10);
      video.onseeked = () => {
        let poster: string | null = null;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = Math.round((video.videoHeight / video.videoWidth) * 320) || 180;
          canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
          poster = canvas.toDataURL("image/jpeg", 0.6);
        } catch {
          // Tainted canvas or no 2d context — the thumbnail is optional.
        }
        finish({ playable: true, duration, poster });
      };
      // Some formats never fire seeked; accept them without a thumbnail.
      window.setTimeout(() => finish({ playable: true, duration, poster: null }), 3000);
    };

    video.src = url;
  });
}

export type UploadResult = { videoId: string; fileUrl: string; title: string | null; posterUrl: string | null };
export type UploadHandle = { promise: Promise<UploadResult>; cancel: () => void };
export type UploadProgress = { sent: number; total: number; percent: number; bytesPerSecond: number; secondsLeft: number };

const PARALLEL_PARTS = 3;
const PART_ATTEMPTS = 3;

/**
 * Identifies a file well enough to match it against an interrupted upload
 * without reading it: name, size and mtime together are as close as the browser
 * lets us get to a fingerprint.
 */
const signatureOf = (file: File) => `msparty:upload:${file.name}:${file.size}:${file.lastModified}`;

function rememberUpload(file: File, videoId: string) {
  try {
    localStorage.setItem(signatureOf(file), videoId);
  } catch {
    // Private mode or a full quota; resuming is a bonus, not a requirement.
  }
}
function forgetUpload(file: File) {
  try {
    localStorage.removeItem(signatureOf(file));
  } catch {}
}
function recallUpload(file: File) {
  try {
    return localStorage.getItem(signatureOf(file));
  } catch {
    return null;
  }
}

/**
 * Multipart upload with per-part retry, cancellation, and resume that survives
 * a reload: the id is kept in the browser and R2 is asked what it already
 * holds, so an interrupted transfer continues instead of starting over.
 */
export function uploadVideo(
  file: File,
  meta: { duration: number; poster?: string | null },
  onProgress: (progress: UploadProgress) => void
): UploadHandle {
  const controller = new AbortController();
  let inFlight: XMLHttpRequest[] = [];

  const cancel = () => {
    controller.abort();
    inFlight.forEach(request => request.abort());
    inFlight = [];
  };

  const promise = (async () => {
    /** Asks the server what is left; 410 means the saved id is stale. */
    async function plan(videoId: string) {
      const response = await fetch(`/api/uploads/${videoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: controller.signal
      });
      if (response.status === 410 || response.status === 404) return null;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "تعذر تجهيز أجزاء الرفع.");
      return data as { partSize: number; partCount: number; uploadedCount: number; remaining: number; urls: { partNumber: number; url: string }[] };
    }

    async function start() {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "تعذر تجهيز الرفع.");
      return data.videoId as string;
    }

    const remembered = recallUpload(file);
    let videoId = remembered || (await start());
    let planned = await plan(videoId);
    if (!planned) {
      // The remembered upload no longer exists; begin a fresh one.
      forgetUpload(file);
      videoId = await start();
      planned = await plan(videoId);
      if (!planned) throw new Error("تعذر تجهيز الرفع.");
    }
    rememberUpload(file, videoId);

    const { partSize } = planned;
    const startedAt = Date.now();
    // Bytes already in the bucket count as done, but not toward the rate: they
    // were not sent in this session, so including them inflates the estimate.
    const carried = Math.min(planned.uploadedCount * partSize, file.size);
    let sentThisRun = 0;
    const partProgress = new Map<number, number>();

    const report = () => {
      const live = [...partProgress.values()].reduce((a, b) => a + b, 0);
      const done = Math.min(carried + sentThisRun + live, file.size);
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = elapsed > 0 ? (sentThisRun + live) / elapsed : 0;
      onProgress({
        sent: done,
        total: file.size,
        percent: Math.round((done / file.size) * 100),
        bytesPerSecond: rate,
        secondsLeft: rate > 0 ? Math.max(0, (file.size - done) / rate) : 0
      });
    };
    report();

    const sendPart = (part: { partNumber: number; url: string }) =>
      new Promise<void>((resolve, reject) => {
        const blob = file.slice((part.partNumber - 1) * partSize, part.partNumber * partSize);
        const request = new XMLHttpRequest();
        inFlight.push(request);
        request.open("PUT", part.url);
        request.upload.onprogress = event => {
          partProgress.set(part.partNumber, event.loaded);
          report();
        };
        request.onload = () => {
          inFlight = inFlight.filter(item => item !== request);
          if (request.status >= 200 && request.status < 300) {
            partProgress.delete(part.partNumber);
            sentThisRun += blob.size;
            report();
            resolve();
          } else reject(new Error(`part ${part.partNumber} failed (${request.status})`));
        };
        request.onerror = () => {
          inFlight = inFlight.filter(item => item !== request);
          reject(new Error("network"));
        };
        request.onabort = () => reject(new Error("aborted"));
        request.send(blob);
      });

    // The server signs a batch at a time, so keep asking until nothing is left.
    let batch = planned;
    while (batch.urls.length) {
      const queue = [...batch.urls];
      const worker = async () => {
        while (queue.length) {
          if (controller.signal.aborted) throw new Error("aborted");
          const part = queue.shift()!;
          let lastError: unknown;
          for (let attempt = 0; attempt < PART_ATTEMPTS; attempt++) {
            try {
              await sendPart(part);
              lastError = null;
              break;
            } catch (error) {
              lastError = error;
              if (error instanceof Error && error.message === "aborted") throw error;
              partProgress.delete(part.partNumber);
              await new Promise(done => setTimeout(done, 500 * (attempt + 1)));
            }
          }
          if (lastError) throw lastError;
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL_PARTS, queue.length) || 1 }, worker));
      const next = await plan(videoId);
      if (!next) throw new Error("تعذر إنهاء الرفع.");
      batch = next;
    }

    const done = await fetch(`/api/uploads/${videoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // The thumbnail rides along with the confirm rather than as its own
      // upload: it is smaller than the round trip that would fetch a URL for it.
      body: JSON.stringify({ duration: meta.duration, title: file.name, poster: meta.poster ?? null })
    });
    const ready = await done.json().catch(() => ({}));
    if (!done.ok) throw new Error(ready.message || "تعذر إنهاء الرفع.");
    forgetUpload(file);
    return { videoId, fileUrl: ready.fileUrl as string, title: ready.title as string | null, posterUrl: ready.posterUrl as string | null };
  })();

  return { promise, cancel };
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatEta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `${Math.ceil(seconds)} ثانية`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `${minutes} دقيقة` : `${Math.floor(minutes / 60)} ساعة و${minutes % 60} دقيقة`;
}
