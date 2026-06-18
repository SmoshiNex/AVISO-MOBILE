/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#0274DF',
        accent: '#208AEF',
        danger: '#EF4444',
      },
    },
  },
  plugins: [],
};
