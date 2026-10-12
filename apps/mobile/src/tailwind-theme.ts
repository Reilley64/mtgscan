import type { TextStyle } from 'react-native';

import { colors, rounded, sizes, spacing, typography } from './theme';

type TextToken = { fontSize: number; lineHeight?: number; fontWeight?: TextStyle['fontWeight'] };

function kebabCase(name: string) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function px(value: number) {
  return `${value}px`;
}

function byClassName<Value, Result>(values: Record<string, Value>, toValue: (value: Value) => Result) {
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [kebabCase(name), toValue(value)]));
}

function textStyle({ fontSize, lineHeight, fontWeight }: TextToken) {
  return [
    px(fontSize),
    { ...(lineHeight ? { lineHeight: px(lineHeight) } : {}), ...(fontWeight ? { fontWeight } : {}) },
  ] as const;
}

export const tailwindTheme = {
  colors: byClassName(colors, (value) => value),
  spacing: byClassName({ ...spacing, ...sizes }, px),
  borderRadius: byClassName(rounded, px),
  fontSize: byClassName<TextToken, ReturnType<typeof textStyle>>(typography, textStyle),
};
