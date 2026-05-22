/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        cairo: ["Cairo", "sans-serif"],
        amiri: ["Amiri", "serif"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        pulse: "pulse 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("daisyui")],
  daisyui: {
    themes: [
      {
        mizan: {
          "primary": "#0F4C3A",        
          "primary-content": "#F9F6F0",
          "secondary": "#B8860B",     
          "secondary-content": "#F9F6F0",
          "accent": "#0A3326",       
          "neutral": "#EBE6D9",         
          "base-100": "#F9F6F0",     
          "base-200": "#EBE6D9",
          "base-300": "#D9D3C4",
        },
      },
    ],
  },
};