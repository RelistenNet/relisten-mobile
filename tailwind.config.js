/** @type {import('tailwindcss').Config} */
// tailwind.config.js
const nativewind = require('nativewind/tailwind/native');

module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './relisten/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [nativewind()],
};
