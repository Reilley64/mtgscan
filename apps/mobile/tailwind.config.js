const { colors, rounded, sizes, spacing, typography } = require('./src/theme');

const kebabCase = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const px = (value) => `${value}px`;
const tokens = (values, toValue = (value) => value) =>
  Object.fromEntries(Object.entries(values).map(([name, value]) => [kebabCase(name), toValue(value)]));
const textStyle = ({ fontSize, lineHeight, fontWeight }) => [
  px(fontSize),
  { ...(lineHeight ? { lineHeight: px(lineHeight) } : {}), ...(fontWeight ? { fontWeight } : {}) },
];

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: tokens(colors),
      spacing: tokens({ ...spacing, ...sizes }, px),
      borderRadius: tokens(rounded, px),
      fontSize: tokens(typography, textStyle),
    },
  },
};
