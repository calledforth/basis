/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary app canvas; hex lives in src/styles.css (--basis-canvas-bg).
        canvas: "var(--basis-canvas-bg)"
      },
      fontFamily: {
        sans: ["var(--basis-font-sans)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", '"Liberation Mono"', '"Courier New"', "monospace"]
      },
      fontSize: {
        "ui-2xs": "10px",
        "ui-xs": "11px",
        "ui-sm": "12px",
        "ui-md": "13px",
        "ui-base": "14px"
      },
      lineHeight: {
        "ui-normal": "1.6",
        "ui-relaxed": "1.75"
      },
      letterSpacing: {
        ui: "0.01em"
      }
    }
  },
  plugins: []
};
