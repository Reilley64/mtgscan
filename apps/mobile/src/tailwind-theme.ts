import { aspectRatios, borderWidths, colors, opacity, rounded, sizes, spacing, typography } from './theme';

type TextToken = { fontSize: number; lineHeight?: number; fontWeight?: string };

type TextClass = [string, { lineHeight?: string; fontWeight?: string }];

function kebabCase(name: string) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function px(value: number) {
  return `${value}px`;
}

function keyedByClassName<Value, Result>(values: Record<string, Value>, toValue: (value: Value) => Result) {
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [kebabCase(name), toValue(value)]));
}

function textStyle({ fontSize, lineHeight, fontWeight }: TextToken): TextClass {
  return [
    px(fontSize),
    { ...(lineHeight ? { lineHeight: px(lineHeight) } : {}), ...(fontWeight ? { fontWeight } : {}) },
  ];
}

export const tailwindTheme = {
  colors: keyedByClassName(colors, (value) => value),
  spacing: keyedByClassName({ ...spacing, ...sizes }, px),
  borderRadius: keyedByClassName(rounded, px),
  fontSize: keyedByClassName(typography, textStyle),
  opacity: keyedByClassName(opacity, String),
  borderWidth: keyedByClassName(borderWidths, px),
  aspectRatio: keyedByClassName(aspectRatios, String),
};
