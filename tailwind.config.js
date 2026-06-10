/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./claude-design/**/*.{js,jsx}",
    "./lib/**/*.{js,ts}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#FAFAFA",
        surface: "#FFFFFF",
        "on-surface": "#1A1D24",
        "on-surface-variant": "#6B7280",
        outline: "#E5E7EB",
        "outline-variant": "#F3F4F6",
        primary: "#EE4F4F",
        "primary-light": "rgba(238, 79, 79, 0.08)",
        "primary-border": "rgba(238, 79, 79, 0.2)",
        success: "#ABFE67",
        "success-text": "#2D5A00",
        "success-light": "rgba(171, 254, 103, 0.15)",
        error: "#DC2626",
        warning: "#F59E0B",
        glass: "rgba(255, 255, 255, 0.7)",
        "glass-border": "rgba(255, 255, 255, 0.4)",
        teal: "#0891B2",
        strava: "#FC4C02",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
      },
      fontSize: {
        display: ["44px", { lineHeight: "1", fontWeight: "800", letterSpacing: "-0.04em" }],
        headline: ["24px", { lineHeight: "1.2", fontWeight: "700", letterSpacing: "-0.02em" }],
        title: ["18px", { lineHeight: "1.3", fontWeight: "700", letterSpacing: "-0.01em" }],
        body: ["15px", { lineHeight: "1.6", fontWeight: "400" }],
        label: ["11px", { lineHeight: "1", fontWeight: "600", letterSpacing: "0.08em" }],
        caption: ["12px", { lineHeight: "1.4", fontWeight: "500" }],
      },
      boxShadow: {
        glass: "0px 10px 30px rgba(26, 29, 36, 0.04)",
        "glass-nav": "0px 8px 32px rgba(0,0,0,0.08)",
        primary: "0px 8px 24px rgba(238, 79, 79, 0.25)",
      },
      borderRadius: {
        glass: "16px",
        dock: "24px",
      },
    },
  },
  plugins: [],
};
