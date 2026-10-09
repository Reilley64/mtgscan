import type { TextStyle } from 'react-native';

export const colors = {
  background: '#080b0d',
  surface: '#11171a',
  surfaceControl: '#232c31',
  sheet: '#161c1f',
  line: '#2a3238',
  text: '#ffffff',
  textMuted: '#b5c0c5',
  textDim: '#7d8a90',
  primary: '#d8ff62',
  onPrimary: '#101500',
  danger: '#ff7a70',
  dangerTint: 'rgba(255, 122, 112, 0.16)',
  grabber: '#4a555b',
  cameraOff: '#000000',
} as const;

export const googleButtonColors = {
  background: '#131314',
  border: '#8e918f',
  text: '#e3e3e3',
} as const;

export const typography = {
  largeTitle: { fontSize: 28, fontWeight: '800', lineHeight: 31 },
  signInTitle: { fontSize: 24, fontWeight: '800', lineHeight: 28 },
  brand: { fontSize: 22, fontWeight: '800' },
  signInButton: { fontSize: 17, fontWeight: '600' },
  googleButton: { fontSize: 16, fontWeight: '500' },
  sheetTitle: { fontSize: 17, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 19 },
  bodyStrong: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 12 },
  credit: { fontSize: 10, fontWeight: '600' },
  tabLabel: { fontSize: 10, fontWeight: '700' },
} as const satisfies Record<string, TextStyle>;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
} as const;

export const rounded = {
  xs: 4,
  sm: 8,
  md: 12,
  full: 999,
} as const;

export const sizes = {
  button: 38,
  signInButton: 50,
  cardPadding: 10,
  googleLogo: 18,
} as const;
