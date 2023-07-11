/** @type {import('tailwindcss').Config} */
// tailwind.config.js
// const nativewind = require('nativewind/tailwind/native');

const colors = require('tailwindcss/colors');
const { lightBlue, warmGray, trueGray, coolGray, blueGray, ...colorsWithoutDeprecated } = colors;
const { RelistenBlue } = require('./relisten/relisten_blue');

const baseFontSize = 14;

module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './relisten/**/*.{js,jsx,ts,tsx}'],
  theme: {
    fontSize: {
      'xs': ['10px'],
      'sm': ['12px'],
      'base': [baseFontSize + 'px'],
      'lg': ['16px'],
      'xl': ['18px'],
      '2xl': ['20px'],
      '3xl': ['24px'], // h4
      '4xl': ['30px'], // h3
      '5xl': ['36px'], // h2
      '6xl': ['48px'], // h1
      '7xl': ['60px'],
    },
    colors: {
      ...colorsWithoutDeprecated,
      'relisten-blue': RelistenBlue,
    },
  },
  // plugins: [nativewind()],
};
