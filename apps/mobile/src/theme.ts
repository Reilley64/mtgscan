import type { TextStyle } from 'react-native';

export const colors = {
  background: '#080b0d',
  surfaceControl: '#232c31',
  sheet: '#161c1f',
  line: '#2a3238',
  text: '#ffffff',
  textMuted: '#b5c0c5',
  textDim: '#7d8a90',
  primary: '#d8ff62',
  cameraOff: '#000000',
} as const;

export const typography = {
  largeTitle: { fontSize: 28, fontWeight: '800', lineHeight: 31 },
  sheetTitle: { fontSize: 17, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 19 },
  bodyStrong: { fontSize: 14, fontWeight: '700' },
  tabLabel: { fontSize: 10, fontWeight: '700' },
} as const satisfies Record<string, TextStyle>;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
} as const;

export const rounded = {
  full: 999,
} as const;

export const sizes = {
  button: 38,
} as const;
