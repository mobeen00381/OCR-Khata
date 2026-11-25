import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#F8FAFC",
        ink: {
          DEFAULT: "#0F172A",
          soft: "#334155",
          mute: "#64748B",
        },
        steel: {
          DEFAULT: "#1E40AF",
          50: "#EEF3FF",
          100: "#DCE6FF",
          600: "#1E40AF",
          700: "#1B3696",
        },
        emerald: {
          DEFAULT: "#059669",
          50: "#ECFDF5",
          100: "#D1FAE5",
          600: "#059669",
          700: "#047857",
        },
        amber: {
          DEFAULT: "#D97706",
          50: "#FFFBEB",
          100: "#FEF3C7",
          600: "#D97706",
          700: "#B45309",
        },
        crimson: {
          DEFAULT: "#DC2626",
          50: "#FEF2F2",
          100: "#FEE2E2",
          600: "#DC2626",
        },
        line: "#E2E8F0",
        mist: "#F1F5F9",
      },
      fontFamily: {
        sans: [
          "Inter Variable",
          "Inter",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "Manrope Variable",
          "Manrope",
          "Inter Variable",
          "Segoe UI",
          "sans-serif",
        ],
        urdu: ["Noto Naskh Arabic", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15, 23, 42, 0.03), 0 8px 24px -16px rgba(15, 23, 42, 0.14)",
        float: "0 18px 40px -18px rgba(15, 23, 42, 0.32)",
        scan: "0 12px 30px -8px rgba(5, 150, 105, 0.55)",
      },
      borderRadius: {
        "2.5xl": "1.35rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scan-sweep": {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "20%": { opacity: "1" },
          "80%": { opacity: "1" },
          "100%": { transform: "translateY(400%)", opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        "scan-sweep": "scan-sweep 2.2s ease-in-out infinite",
        shimmer: "shimmer 2.6s linear infinite",
        "pulse-soft": "pulseSoft 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
