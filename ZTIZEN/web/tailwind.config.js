/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ztizen-purple': {
          light: '#764ba2',
          DEFAULT: '#667eea',
        }
      }
    },
  },
  plugins: [],
}
