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
  textPrice: '#e4e8ea',
  glassTextMuted: '#dce3e6',
  glassTextDim: '#b5c0c5',
  glassSkeleton: '#ffffff1f',
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
  rarityCommon: '#e6e8e9',
  rarityUncommon: '#a7bccb',
  rarityRare: '#e2bd5a',
  rarityMythic: '#f26a35',
  raritySpecial: '#b48ef0',
  manaGeneric: '#beb9b2',
  manaWhite: '#f0f2c0',
  manaBlue: '#b5cde3',
  manaBlack: '#aca29a',
  manaRed: '#db8664',
  manaGreen: '#93b483',
  manaGlyph: '#111111',
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
  price: { fontSize: 12, fontWeight: '600' },
  chip: { fontSize: 11, fontWeight: '700' },
  credit: { fontSize: 10, fontWeight: '600' },
  tabLabel: { fontSize: 10, fontWeight: '700' },
  manaSymbol: { fontSize: 9 },
  manaSymbolSplit: { fontSize: 5 },
  manaSymbolBare: { fontSize: 12 },
} as const satisfies Record<string, TextStyle>;

export const fontFamilies = {
  mana: 'Mana',
} as const;

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
  sheen: 0.3,
  heroArt: 0.45,
} as const;

export const blurRadii = {
  heroArt: 26,
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
  floatingButton: 48,
  commanderGalleryCard: 140,
  deckBanner: 200,
  swipeTrack: 52,
  selectedOutline: 2,
  chevron: 14,
  rowSymbol: 22,
  iconButtonSymbol: 18,
  setIcon: 16,
  staleSymbol: 11,
  chipSymbol: 11,
  protectedSymbol: 11,
  deckBoxSymbol: 11,
  chipPadding: 9,
  cardThumbnailWidth: 40,
  cardThumbnailHeight: 56,
  commanderAvatar: 40,
  bannerCommanderAvatar: 48,
  deckTagAvatar: 18,
  skeletonTitleBar: typography.bodyStrong.fontSize,
  skeletonMetaBar: typography.meta.fontSize,
  quantityBadge: 19,
  quantityBadgeInset: 5,
  countBadge: 17,
  grabberWidth: 36,
  grabberHeight: 5,
  brandMarkWidth: 18,
  brandMarkHeight: 25,
  failureMark: 22,
  emptyStateSymbol: 40,
  manaSymbol: 12,
  manaSymbolSplitInset: 1,
} as const;

export const borderWidths = {
  selectedOutline: sizes.selectedOutline,
  brandMark: 2.5,
  illustrationOutline: 2,
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

const foilSheenStops = [
  ['transparent', '22%'],
  ['rgba(255, 80, 170, 0.55)', '34%'],
  ['rgba(255, 230, 90, 0.5)', '42%'],
  ['rgba(80, 255, 200, 0.5)', '50%'],
  ['rgba(80, 150, 255, 0.55)', '58%'],
  ['rgba(200, 110, 255, 0.5)', '66%'],
  ['transparent', '78%'],
] as const;

const etchedSheenStops = [
  ['transparent', '25%'],
  ['rgba(255, 255, 255, 0.55)', '42%'],
  ['rgba(200, 210, 215, 0.25)', '50%'],
  ['rgba(255, 255, 255, 0.55)', '58%'],
  ['transparent', '75%'],
] as const;

function linearGradient(angle: string, stops: readonly (readonly [string, string])[]) {
  return `linear-gradient(${angle}, ${stops.map(([color, stop]) => `${color} ${stop}`).join(', ')})`;
}

export const gradients = {
  foilSheen: linearGradient('115deg', foilSheenStops),
  etchedSheen: linearGradient('120deg', etchedSheenStops),
  binderWallScrim: `linear-gradient(180deg, ${scrimStops.map(([alpha, stop]) => `${colors.background}${alpha} ${stop}`).join(', ')})`,
  emptyStateFade: `linear-gradient(180deg, ${colors.background}00 30%, ${colors.background} 100%)`,
  commanderArtScrim: `linear-gradient(180deg, ${colors.background}00 30%, ${colors.background}e6 100%)`,
} as const;

export function manaSplitGradient(top: string, bottom: string) {
  return linearGradient('135deg', [
    [top, '50%'],
    [bottom, '50%'],
  ]);
}

export const aspectRatios = {
  cardImage: 488 / 680,
} as const;
