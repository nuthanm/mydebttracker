/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: { DEFAULT: '#0E1714', soft: '#3A4742', mute: '#7A867F' },
        paper: { DEFAULT: '#FAF8F2', card: '#FFFFFF', tint: '#F1ECDF' },
        edge: '#E2DDCB',
        mint:  { 50: '#E1F5EE', 600: '#0F6E56', 700: '#085041' },
        sky:   { 50: '#E6F1FB', 600: '#185FA5' },
        ember: { 50: '#FAECE7', 600: '#993C1D' },
        honey: { 50: '#FAEEDA', 600: '#854F0B' },
        plum:  { 50: '#EEEDFE', 600: '#3C3489' },
        rose:  { 50: '#FBEAF0', 600: '#72243E' },
        danger:{ DEFAULT: '#A32D2D', soft: '#FCEBEB' },
      },
    },
  },
  plugins: [],
};
