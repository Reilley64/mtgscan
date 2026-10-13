import { cva, type VariantProps } from 'class-variance-authority';
import { GlassContainer, GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { cssInterop } from 'nativewind';
import { createContext, use, type ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from '@/lib/class-names';
import { spacing } from '@/theme';

cssInterop(GlassView, { className: 'style' });
cssInterop(GlassContainer, { className: 'style' });

const OnGlassContext = createContext(false);

export function useOnGlass() {
  return use(OnGlassContext);
}

export const placeholderFills = cva('', {
  variants: {
    onGlass: {
      true: 'bg-glass-skeleton',
      false: 'bg-line',
    },
  },
});

const fallbackSurfaces = cva('', {
  variants: {
    fallback: {
      surface: 'bg-surface',
      'surface-control': 'bg-surface-control',
    },
  },
});

type GlassSurfaceProps = Required<VariantProps<typeof fallbackSurfaces>> & {
  className?: string;
  interactive?: boolean;
  children: ReactNode;
};

export function GlassSurface({ fallback, className, interactive = false, children }: GlassSurfaceProps) {
  if (!isLiquidGlassAvailable()) {
    return <View className={cn(fallbackSurfaces({ fallback }), className)}>{children}</View>;
  }
  return (
    <OnGlassContext value>
      <GlassView glassEffectStyle="regular" isInteractive={interactive} className={className}>
        {children}
      </GlassView>
    </OnGlassContext>
  );
}

export function GlassGroup({ className, children }: { className?: string; children: ReactNode }) {
  if (!isLiquidGlassAvailable()) {
    return <View className={className}>{children}</View>;
  }
  return (
    <GlassContainer spacing={spacing.sm} className={className}>
      {children}
    </GlassContainer>
  );
}
