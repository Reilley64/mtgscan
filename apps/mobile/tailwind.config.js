const { tailwindTheme } = require('./src/tailwind-theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: tailwindTheme,
  },
};
