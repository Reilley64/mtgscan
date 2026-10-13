import type { TextStyle } from 'react-native';

export const colors = {
  background: '#080b0d',
  surface: '#11171a',
  surfaceRaised: '#1a2125',
  surfaceControl: '#232c31',
  sheet: '#161c1f',
  line: '#2a3238',
  text: '#ffffff',
  textMuted: '#b5c0c5',
  textDim: '#7d8a90',
  primary: '#d8ff62',
  onPrimary: '#101500',
  grabber: '#4a555b',
  dangerTint: '#ff7a7029',
  quantityBadge: '#000000d1',
  warning: '#f4d06f',
  danger: '#ff7a70',
  incoming: '#d8ff62',
  outgoing: '#ff8a7a',
  info: '#8fd3ff',
  badge: '#e0244a',
  cardOutline: '#ff4fd8',
  cameraOff: '#000000',
} as const;

export const appleButtonColors = {
  background: '#ffffff',
  text: '#000000',
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
  cardTitle: { fontSize: 20, fontWeight: '800', lineHeight: 23 },
  sheetTitle: { fontSize: 17, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 19 },
  field: { fontSize: 14 },
  bodyStrong: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 12 },
  chip: { fontSize: 11, fontWeight: '700' },
  credit: { fontSize: 10, fontWeight: '600' },
  tabLabel: { fontSize: 10, fontWeight: '700' },
} as const satisfies Record<string, TextStyle>;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 32,
} as const;

export const rounded = {
  xs: 4,
  sm: 8,
  md: 12,
  full: 999,
} as const;

export const opacity = {
  dimmed: 0.38,
} as const;

export const sizes = {
  button: 38,
  signInButton: 50,
  cardPadding: 10,
  googleLogo: 18,
  cardOutline: 3,
  progressBar: 4,
  chip: 24,
  quickAction: 32,
  quickActionDivider: 16,
  touchTarget: 44,
  selectedOutline: 2,
  chevron: 14,
  setIcon: 16,
  chipPadding: 9,
  cardThumbnailWidth: 40,
  cardThumbnailHeight: 56,
  skeletonTitleBar: typography.bodyStrong.fontSize,
  skeletonMetaBar: typography.meta.fontSize,
  quantityBadge: 19,
  quantityBadgeInset: 5,
  grabberWidth: 36,
  grabberHeight: 5,
  brandMarkWidth: 18,
  brandMarkHeight: 25,
  failureMark: 22,
} as const;

export const borderWidths = {
  selectedOutline: sizes.selectedOutline,
  brandMark: 2.5,
} as const;

export const shadows = {
  sheet: '0px -12px 40px rgba(0, 0, 0, 0.55)',
} as const;

const scrimStops = [
  ['e6', '0%'],
  ['33', '16%'],
  ['40', '45%'],
  ['e6', '62%'],
] as const;

export const gradients = {
  binderWallScrim: `linear-gradient(180deg, ${scrimStops.map(([alpha, stop]) => `${colors.background}${alpha} ${stop}`).join(', ')})`,
} as const;

export const aspectRatios = {
  cardImage: 488 / 680,
} as const;
