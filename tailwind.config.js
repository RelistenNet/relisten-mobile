/** @type {import('tailwindcss').Config} */
// tailwind.config.js
// const nativewind = require('nativewind/tailwind/native');

const colors = require('tailwindcss/colors');
const { lightBlue, warmGray, trueGray, coolGray, blueGray, ...colorsWithoutDeprecated } = colors;

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
      'relisten-blue': {
        DEFAULT: '#009DC1',
        50: '#A2EEFF',
        100: '#8EEAFF',
        200: '#65E2FF',
        300: '#3CDBFF',
        400: '#14D3FF',
        500: '#00BEEA',
        600: '#009DC1',
        700: '#006F89',
        800: '#004251',
        900: '#001D24',
        950: '#001114',
      },
    },
  },
  // plugins: [nativewind()],
};
