import type { SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { dashedOutlineClass } from '@/components/atoms/dashed-outline';
import { Surface } from '@/components/atoms/surface';
import { SymbolView } from '@/components/atoms/symbol-view';
import { cardColumnClass, cardsPerRow } from '@/components/molecules/card-tile';
import { CommanderCardFrame, CommanderTitleShape } from '@/components/molecules/commander-card';
import { NeedsYouItemShape } from '@/components/molecules/needs-you-skeleton';
import { cn } from '@/lib/class-names';
import { gradients, sizes } from '@/theme';

const barClass = 'h-skeleton-meta-bar rounded-full bg-line';

type FadeProps = { onSheet?: boolean };

function FadesDown({ onSheet = false, children }: FadeProps & { children: ReactNode }) {
  return (
    <View className="w-full items-center">
      {children}
      <View pointerEvents="none" className="absolute inset-0" style={onSheet ? styles.sheetFade : styles.fade} />
    </View>
  );
}

export function EmptyBinderSlots({ rows, onSheet }: FadeProps & { rows: number }) {
  return (
    <FadesDown onSheet={onSheet}>
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

function LineBlock({ className }: { className: string }) {
  return <View className={cn('bg-line', className)} />;
}

export function GhostNeedsYouItems() {
  return (
    <FadesDown>
      <View className="w-full gap-sm">
        {[0, 1].map((item) => (
          <NeedsYouItemShape key={item} block={LineBlock} />
        ))}
      </View>
    </FadesDown>
  );
}

export function GhostCommanderCard({ onSheet }: FadeProps) {
  return (
    <FadesDown onSheet={onSheet}>
      <CommanderCardFrame>
        <CommanderTitleShape block={LineBlock} />
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
  sheetFade: { experimental_backgroundImage: gradients.emptyStateSheetFade },
});
