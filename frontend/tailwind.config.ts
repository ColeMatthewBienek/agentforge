import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0d1117",
        foreground: "#e6edf3",
        sidebar: "#161b22",
        border: "#30363d",
        card: {
          DEFAULT: "#161b22",
          foreground: "#e6edf3",
        },
        primary: {
          DEFAULT: "#238636",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#21262d",
          foreground: "#e6edf3",
        },
        muted: {
          DEFAULT: "#21262d",
          foreground: "#8b949e",
        },
        accent: {
          DEFAULT: "#1f6feb",
          foreground: "#ffffff",
        },
        destructive: {
          DEFAULT: "#f85149",
          foreground: "#ffffff",
        },
        input: "#21262d",
        ring: "#388bfd",
        // Status badge colours
        status: {
          idle: "#8b949e",
          busy: "#d29922",
          active: "#3fb950",
          error: "#f85149",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', "monospace"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
