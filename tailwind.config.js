/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./client/index.html",
    "./client/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'coral': {
          500: '#FA8072',
          600: '#F67868',
        },
        'peach': '#FFEAA7',
        'mint': '#98D8C8',
      },
    },
  },
  plugins: [],
}
