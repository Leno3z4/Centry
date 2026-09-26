/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#080808",
        foreground: "#ffffff",
        card: "#0d0d0d",
        border: "#2a2a2a",
        "muted-foreground": "rgba(255,255,255,.58)",
      },
      borderRadius: {
        xl: "0.75rem",
      },
    },
  },
  corePlugins: { preflight: false },
  plugins: [],
};
