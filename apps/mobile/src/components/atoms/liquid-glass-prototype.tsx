import { GlassContainer, GlassView, isLiquidGlassAvailable, type GlassStyle } from 'expo-glass-effect';
import { cssInterop } from 'nativewind';
import { createContext, use, type ComponentProps, type ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from '@/lib/class-names';
import { colors, spacing } from '@/theme';

cssInterop(GlassView, { className: 'style' });
cssInterop(GlassContainer, { className: 'style' });

type Glass = { style: GlassStyle; tintColor?: string };

export const glassVariants: Record<'A' | 'B' | 'C' | 'D', { name: string; glass: Glass | null }> = {
  A: { name: 'Dark surface', glass: null },
  B: { name: 'Regular glass, no tint', glass: { style: 'regular' } },
  C: { name: 'Regular glass, dark tint 40%', glass: { style: 'regular', tintColor: `${colors.background}66` } },
  D: { name: 'Clear glass, dark tint 60%', glass: { style: 'clear', tintColor: `${colors.background}99` } },
};

export type GlassVariant = keyof typeof glassVariants;

export const glassVariantKeys = Object.keys(glassVariants) as GlassVariant[];

export const liquidGlassAvailable = isLiquidGlassAvailable();

export const GlassVariantContext = createContext<GlassVariant>('A');

function useGlass() {
  const variant = use(GlassVariantContext);
  return liquidGlassAvailable ? glassVariants[variant].glass : null;
}

type GlassSurfaceProps = {
  className?: string;
  fallbackClassName: string;
  interactive?: boolean;
  children: ReactNode;
};

export function GlassSurface({ className, fallbackClassName, interactive = false, children }: GlassSurfaceProps) {
  const glass = useGlass();
  if (!glass) {
    return <View className={cn(className, fallbackClassName)}>{children}</View>;
  }
  return (
    <GlassView glassEffectStyle={glass.style} tintColor={glass.tintColor} isInteractive={interactive} className={className}>
      {children}
    </GlassView>
  );
}

export function GlassGroup(props: Omit<ComponentProps<typeof View>, 'children'> & { children: ReactNode }) {
  const glass = useGlass();
  return glass ? <GlassContainer spacing={spacing.sm} {...props} /> : <View {...props} />;
}
