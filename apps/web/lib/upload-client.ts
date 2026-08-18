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

export type UploadHandle = { promise: Promise<{ videoId: string; fileUrl: string }>; cancel: () => void };
export type UploadProgress = { sent: number; total: number; percent: number; bytesPerSecond: number; secondsLeft: number };

const PARALLEL_PARTS = 3;
const PART_ATTEMPTS = 3;

/**
 * Multipart upload with per-part retry and resume. R2 is asked which parts it
 * already holds, so an interrupted upload continues instead of restarting —
 * which is what made a failure at 90% so expensive before.
 */
export function uploadVideo(
  file: File,
  meta: { duration: number },
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
    const init = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size }),
      signal: controller.signal
    });
    const started = await init.json().catch(() => ({}));
    if (!init.ok) throw new Error(started.message || "تعذر تجهيز الرفع.");

    const { videoId, partSize, partCount } = started as { videoId: string; partSize: number; partCount: number };
    const allParts = Array.from({ length: partCount }, (_, index) => index + 1);

    const plan = await fetch(`/api/uploads/${videoId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partNumbers: allParts }),
      signal: controller.signal
    });
    const planned = await plan.json().catch(() => ({}));
    if (!plan.ok) throw new Error(planned.message || "تعذر تجهيز أجزاء الرفع.");

    const urls: { partNumber: number; url: string }[] = planned.urls;
    const alreadyThere: number = (planned.uploaded || []).length;

    const startedAt = Date.now();
    let sent = alreadyThere * partSize;
    const partProgress = new Map<number, number>();

    const report = () => {
      const total = file.size;
      const done = Math.min(sent + [...partProgress.values()].reduce((a, b) => a + b, 0), total);
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = elapsed > 0 ? done / elapsed : 0;
      onProgress({
        sent: done,
        total,
        percent: Math.round((done / total) * 100),
        bytesPerSecond: rate,
        secondsLeft: rate > 0 ? Math.max(0, (total - done) / rate) : 0
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
            sent += blob.size;
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

    const queue = [...urls];
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

    const done = await fetch(`/api/uploads/${videoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duration: meta.duration, title: file.name })
    });
    const ready = await done.json().catch(() => ({}));
    if (!done.ok) throw new Error(ready.message || "تعذر إنهاء الرفع.");
    return { videoId, fileUrl: ready.fileUrl as string };
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
