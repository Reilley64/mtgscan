import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { CommanderAvatar } from '@/components/atoms/commander-avatar';
import { SetIcon } from '@/components/atoms/set-icon';
import { SymbolView } from '@/components/atoms/symbol-view';
import { Text } from '@/components/atoms/text';
import { sizes } from '@/theme';

type CopyMetaProps = {
  setCode: string;
  rarity: ComponentProps<typeof SetIcon>['rarity'];
  setIconUri: string | undefined;
  collectorNumber: string;
  condition?: string;
  isProtected?: boolean;
  deck?: { commanderArtUri: string | null };
  isHeld?: boolean;
};

export function CopyMeta({
  setCode,
  rarity,
  setIconUri,
  collectorNumber,
  condition,
  isProtected = false,
  deck,
  isHeld = false,
}: CopyMetaProps) {
  const setLabel = setCode.toUpperCase();
  return (
    <View className="flex-row items-center justify-center gap-xs">
      {deck && <CommanderAvatar uri={deck.commanderArtUri} size="meta" />}
      {isHeld && <SymbolView name="bookmark.fill" size={sizes.heldSymbol} className="text-info" />}
      {isProtected && <SymbolView name="shield.fill" size={sizes.protectedSymbol} className="text-warning" />}
      {setIconUri ? (
        <View accessible accessibilityLabel={setLabel}>
          <SetIcon uri={setIconUri} rarity={rarity} />
        </View>
      ) : (
        <Text variant="meta">{setLabel}</Text>
      )}
      <Text variant="meta">{collectorNumber}</Text>
      {condition && (
        <>
          <Text variant="meta" className="text-text-dim">
            ·
          </Text>
          <Text variant="meta">{condition}</Text>
        </>
      )}
    </View>
  );
}
