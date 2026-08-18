import type { MetadataRoute } from "next";

/**
 * Makes the site installable. That matters beyond a tidy home-screen icon: iOS
 * refuses web push entirely until a site has been added to the home screen, so
 * without this the notification toggle is dead for every iPhone user.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MSParty — اتفرجوا سوا",
    short_name: "MSParty",
    description: "اعمل سهرة فيلم مع صحابك من أي مكان. الهوست يشغّل، والكل يتفرج في نفس اللحظة.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#140a0d",
    theme_color: "#140a0d",
    lang: "ar",
    dir: "rtl",
    orientation: "any",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Maskable is a separate purpose, not an extra: Android crops a plain
      // icon into its own shape, and one drawn edge to edge loses its corners.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
