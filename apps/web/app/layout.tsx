import type { Metadata, Viewport } from "next";
import { Rakkas, IBM_Plex_Sans_Arabic, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { DepartingGate } from "@/components/auth/departing-gate";

const display = Rakkas({ subsets: ["arabic", "latin"], weight: "400", variable: "--font-display", display: "swap" });
const body = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-body", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "MSParty — اتفرجوا سوا", template: "%s · MSParty" },
  description: "اعمل سهرة فيلم مع صحابك من أي مكان. الهوست يشغّل، والكل يتفرج في نفس اللحظة.",
  openGraph: {
    title: "MSParty — اتفرجوا سوا",
    description: "اعمل سهرة فيلم مع صحابك من أي مكان. الهوست يشغّل، والكل يتفرج في نفس اللحظة.",
    locale: "ar_EG",
    type: "website"
  }
};

export const viewport: Viewport = { themeColor: "#140a0d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="grain">
        {children}
        {/* Last, and outside the page: it covers whatever rendered above it when
            the session belongs to an account that has asked to be erased. */}
        <DepartingGate />
      </body>
    </html>
  );
}
