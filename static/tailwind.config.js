
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#0f1724",
        panel: "#1b2434"
      }
    },
  },
  plugins: [],
}
