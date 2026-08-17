import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Retro cinema: a dark maroon house, gilded trim, ivory type.
        ink: { DEFAULT: "#140a0d", deep: "#0b0507" },
        velvet: { DEFAULT: "#2d1418", hi: "#3d1c22" },
        gold: { DEFAULT: "#c9a227", lit: "#e8c250" },
        ivory: { DEFAULT: "#f2e8d5", dim: "#a89684" },
        curtain: "#d64545"
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"]
      },
      // Sharp trim, not the soft pill shapes of the old theme.
      borderRadius: { DEFAULT: "4px", sm: "2px", md: "6px", lg: "8px", xl: "12px" },
      boxShadow: {
        marquee: "0 0 0 1px rgba(201,162,39,.28), 0 0 28px rgba(201,162,39,.10)",
        lift: "0 12px 32px rgba(0,0,0,.45)"
      },
      keyframes: {
        "soft-pulse": { "50%": { transform: "scale(1.28)", opacity: ".58" } },
        "message-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "reaction-float": {
          from: { opacity: "0", transform: "translateY(0) scale(.7)" },
          "20%": { opacity: "1", transform: "translateY(-12px) scale(1.1)" },
          to: { opacity: "0", transform: "translateY(-90px) scale(1)" }
        }
      },
      animation: {
        "soft-pulse": "soft-pulse 2s ease-in-out infinite",
        "message-in": "message-in .35s ease-out both",
        "reaction-float": "reaction-float 1.8s ease-out both"
      }
    }
  },
  plugins: []
} satisfies Config;
