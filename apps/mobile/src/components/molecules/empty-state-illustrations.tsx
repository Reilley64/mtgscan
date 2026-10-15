import type { SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { dashedOutlineClass } from '@/components/atoms/dashed-outline';
import { Surface } from '@/components/atoms/surface';
import { SymbolView } from '@/components/atoms/symbol-view';
import { Text } from '@/components/atoms/text';
import { cardColumnClass, cardsPerRow } from '@/components/molecules/card-tile';
import { CommanderCardFrame } from '@/components/molecules/commander-card';
import { cn } from '@/lib/class-names';
import { gradients, sizes } from '@/theme';

const barClass = 'h-skeleton-meta-bar rounded-full bg-line';

function FadesDown({ children }: { children: ReactNode }) {
  return (
    <View className="w-full items-center">
      {children}
      <View pointerEvents="none" className="absolute inset-0" style={styles.fade} />
    </View>
  );
}

export function EmptyBinderSlots({ rows }: { rows: number }) {
  return (
    <FadesDown>
      <View className="w-3/4 flex-row flex-wrap gap-y-md">
        {Array.from({ length: rows * cardsPerRow }, (_, slot) => (
          <View key={slot} className={cn(cardColumnClass, 'px-xs')}>
            <View className={cn(dashedOutlineClass, 'aspect-card-image rounded-sm')} />
          </View>
        ))}
      </View>
    </FadesDown>
  );
}

function GhostChangeLine({ sign }: { sign: string }) {
  return (
    <View className="flex-row items-center gap-sm rounded-sm bg-surface-raised p-sm">
      <Text variant="body-strong" className="text-text-dim">
        {sign}
      </Text>
      <CardThumbnail uri={undefined} />
      <View className={cn(barClass, 'w-1/2')} />
    </View>
  );
}

export function GhostNeedsYouItems() {
  return (
    <FadesDown>
      <View className="w-full gap-sm">
        {[0, 1].map((item) => (
          <Surface key={item} className="gap-sm">
            <View className="flex-row items-center gap-sm">
              <View className="h-chip w-chip rounded-full bg-line" />
              <View className={cn(barClass, 'w-1/3')} />
            </View>
            <GhostChangeLine sign="+" />
            <GhostChangeLine sign="−" />
          </Surface>
        ))}
      </View>
    </FadesDown>
  );
}

export function GhostCommanderCard() {
  return (
    <FadesDown>
      <CommanderCardFrame>
        <View className="h-skeleton-title-bar w-1/2 rounded-full bg-line" />
        <View className="flex-row gap-sm">
          <View className="h-chip w-1/6 rounded-md bg-line" />
          <View className="h-chip w-1/5 rounded-md bg-line" />
        </View>
      </CommanderCardFrame>
    </FadesDown>
  );
}

export function DashedCardFrame({ symbol }: { symbol: SFSymbol }) {
  return (
    <View className={cn(dashedOutlineClass, 'aspect-card-image w-1/3 items-center justify-center rounded-sm')}>
      <SymbolView name={symbol} size={sizes.emptyStateSymbol} className="text-line" />
    </View>
  );
}

export function GhostBatchRows() {
  return (
    <View className="w-full gap-sm">
      {['w-[70%]', 'w-[55%]', 'w-[62%]'].map((titleWidth) => (
        <Surface key={titleWidth} className="flex-row items-center gap-md p-sm">
          <CardThumbnail uri={undefined} />
          <View className="flex-1 gap-sm">
            <View className={cn('h-skeleton-title-bar rounded-full bg-line', titleWidth)} />
            <View className={cn(barClass, 'w-[45%]')} />
          </View>
        </Surface>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fade: { experimental_backgroundImage: gradients.emptyStateFade },
});
