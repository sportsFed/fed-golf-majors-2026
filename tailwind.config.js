/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Playfair Display'", "Georgia", "serif"],
        body: ["'DM Sans'", "sans-serif"],
        mono: ["'DM Mono'", "monospace"]
      },
      colors: {
        green: {
          50: "#f0faf4",
          100: "#dcf5e7",
          200: "#bbead0",
          300: "#86d8b0",
          400: "#4dbd88",
          500: "#28a06a",
          600: "#1a8255",
          700: "#166844",
          800: "#155338",
          900: "#12432f",
          950: "#092619"
        },
        gold: {
          50: "#fefce8",
          100: "#fef9c3",
          200: "#fef08a",
          300: "#fde047",
          400: "#facc15",
          500: "#eab308",
          600: "#ca8a04",
          700: "#a16207",
          800: "#854d0e",
          900: "#713f12"
        },
        fairway: {
          dark: "#0a1f14",
          mid: "#112d1c",
          light: "#1a4229"
        }
      },
      backgroundImage: {
        "fairway-gradient": "linear-gradient(135deg, #0a1f14 0%, #112d1c 50%, #0a1f14 100%)"
      }
    }
  },
  plugins: []
};
