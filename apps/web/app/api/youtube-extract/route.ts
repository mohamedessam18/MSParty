import { NextResponse } from "next/server";

const INVIDIOUS_INSTANCES = [
  "https://invidious.privacydev.net",
  "https://inv.tux.pizza",
  "https://invidious.nerdvpn.de",
  "https://vid.puffyan.us"
];

function extractId(url: string) {
  if (!url) return "";
  const trimmed = url.trim();
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = trimmed.match(regExp);
  if (match && match[2].length === 11) return match[2];
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return trimmed;
}

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    const videoId = extractId(url);
    if (!videoId) return NextResponse.json({ message: "رابط YouTube غير صحيح" }, { status: 400 });

    // Try Piped API first
    try {
      const pipedRes = await fetch(`https://pipedapi.kavin.rocks/streams/${videoId}`, { cache: "no-store" });
      if (pipedRes.ok) {
        const pipedData = await pipedRes.json();
        const videoStreams = pipedData.videoStreams || [];
        // Find best combined or video stream (prefer MP4 / H.264)
        const bestStream = videoStreams.find((s: any) => s.videoOnly === false && s.format === "v1080p")
          || videoStreams.find((s: any) => s.videoOnly === false && s.format === "v720p")
          || videoStreams.find((s: any) => s.videoOnly === false)
          || videoStreams[0];

        if (bestStream?.url) {
          return NextResponse.json({
            videoId,
            streamUrl: bestStream.url,
            title: pipedData.title || "فيديو YouTube",
            mimeType: bestStream.mimeType || "video/mp4"
          });
        }
      }
    } catch {
      // Fallthrough to Invidious
    }

    // Try Invidious instances
    for (const instance of INVIDIOUS_INSTANCES) {
      try {
        const res = await fetch(`${instance}/api/v1/videos/${videoId}`, { cache: "no-store" });
        if (!res.ok) continue;
        const data = await res.json();
        const formatStreams = data.formatStreams || [];
        const bestFormat = formatStreams.find((f: any) => f.qualityLabel === "720p" || f.qualityLabel === "1080p") || formatStreams[0];
        if (bestFormat?.url) {
          return NextResponse.json({
            videoId,
            streamUrl: bestFormat.url,
            title: data.title || "فيديو YouTube",
            mimeType: bestFormat.container ? `video/${bestFormat.container}` : "video/mp4"
          });
        }
      } catch {
        continue;
      }
    }

    return NextResponse.json({ message: "تعذر استخراج رابط الفيديو المباشر." }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ message: err?.message || "حدث خطأ أثناء معالجة رابط يوتيوب." }, { status: 500 });
  }
}
