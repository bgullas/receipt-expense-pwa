/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        qb: { blue: '#2563eb', green: '#16a34a' }
      }
    }
  },
  plugins: []
}
