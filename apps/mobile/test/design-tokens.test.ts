/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import resolveConfig from 'tailwindcss/resolveConfig';
import { parse } from 'yaml';

import tailwindConfig from '../tailwind.config';

type DesignTokens = {
  colors: Record<string, string>;
  typography: Record<string, { fontSize: string; fontWeight?: number; lineHeight?: number }>;
  rounded: Record<string, string>;
  spacing: Record<string, string>;
};

type TailwindTheme = {
  colors: Record<string, string>;
  fontSize: Record<string, [string, { fontWeight?: string; lineHeight?: string }]>;
  borderRadius: Record<string, string>;
  spacing: Record<string, string>;
};

const designFile = readFileSync(join(__dirname, '../../../DESIGN.md'), 'utf8');
const design: DesignTokens = parse(designFile.split('---\n')[1]);
const theme = resolveConfig(tailwindConfig).theme as unknown as TailwindTheme;

function pixels(value: string) {
  return Number(value.replace('px', ''));
}

function pick<Value, Result = Value>(
  scale: Record<string, Value>,
  names: string[],
  toResult: (value: Value) => Result = (value) => value as unknown as Result,
) {
  return Object.fromEntries(names.map((name) => [name, scale[name] === undefined ? undefined : toResult(scale[name])]));
}

test('the Tailwind theme has every DESIGN.md color', () => {
  expect(pick(theme.colors, Object.keys(design.colors))).toEqual(design.colors);
});

test('the Tailwind theme has every DESIGN.md type style', () => {
  const expected = pick(design.typography, Object.keys(design.typography), ({ fontSize, fontWeight, lineHeight }) => ({
    fontSize: pixels(fontSize),
    fontWeight: fontWeight === undefined ? undefined : String(fontWeight),
    lineHeight: lineHeight === undefined ? undefined : Math.round(pixels(fontSize) * lineHeight),
  }));

  const typeStyles = pick(theme.fontSize, Object.keys(design.typography), ([fontSize, { fontWeight, lineHeight }]) => ({
    fontSize: pixels(fontSize),
    fontWeight,
    lineHeight: lineHeight === undefined ? undefined : pixels(lineHeight),
  }));

  expect(typeStyles).toEqual(expected);
});

test('the Tailwind theme has every DESIGN.md corner radius', () => {
  expect(pick(theme.borderRadius, Object.keys(design.rounded))).toEqual(design.rounded);
});

test('the Tailwind theme has every DESIGN.md spacing step', () => {
  expect(pick(theme.spacing, Object.keys(design.spacing))).toEqual(design.spacing);
});
