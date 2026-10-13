import type * as GlassEffect from 'expo-glass-effect';

const glassEffect = jest.requireActual<typeof GlassEffect>('expo-glass-effect');

let available = false;

export const fakeGlassEffect = {
  ...glassEffect,
  isLiquidGlassAvailable: () => available,
};

export function liquidGlassIsAvailable() {
  available = true;
}

export function resetFakeGlassEffect() {
  available = false;
}
