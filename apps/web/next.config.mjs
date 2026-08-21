/**
 * The origins allowed to frame the room overlay. Must stay in step with the
 * extension's host_permissions — a service missing here loads the panel into a
 * blank frame with an error only visible in the console.
 */
const PLATFORM_ORIGINS = [
  "https://www.netflix.com",
  "https://shahid.mbc.net",
  "https://www.disneyplus.com",
  "https://stream.osn.com",
  "https://www.osnplus.com",
  "https://www.primevideo.com",
  "https://app.watchit.com",
  "https://www.watchit.com",
  "https://www.viu.com"
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "2gb" } },
  async headers() {
    return [
      {
        // Only the overlay may be framed, and only by the services the
        // extension runs on. Everything else keeps the default of nowhere.
        source: "/overlay/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors 'self' ${PLATFORM_ORIGINS.join(" ")};`
          },
          // The panel carries a session token in its URL; a referrer would leak
          // it to whatever the page links out to.
          { key: "Referrer-Policy", value: "no-referrer" }
        ]
      },
      {
        // The television screen shows a pairing code, and a code on screen is
        // an offer to hand an account over. Framed inside someone else's page
        // it becomes an offer to hand it to them, so nothing may frame it.
        source: "/tv/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none';" },
          { key: "Referrer-Policy", value: "no-referrer" }
        ]
      }
    ];
  }
};

export default nextConfig;
