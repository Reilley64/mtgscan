const { tailwindTheme } = require('./src/tailwind-theme');

module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: tailwindTheme,
  },
};
