import { SymbolView } from 'expo-symbols';
import { ActivityIndicator } from 'react-native';

import { DangerMark } from '@/components/atoms/danger-mark';
import { GlassSurface } from '@/components/atoms/glass-surface';
import { Text } from '@/components/atoms/text';
import { colors, sizes } from '@/theme';

export type PullIndicatorKind = 'pull' | 'release' | 'adding' | 'failed';

function Lead({ kind }: { kind: PullIndicatorKind }) {
  switch (kind) {
    case 'pull':
      return <SymbolView name="arrow.down" size={sizes.iconButtonSymbol} tintColor={colors.text} />;
    case 'release':
      return <SymbolView name="plus" size={sizes.iconButtonSymbol} tintColor={colors.text} />;
    case 'adding':
      return <ActivityIndicator color={colors.text} />;
    case 'failed':
      return <DangerMark />;
  }
}

export function PullIndicator({ label, kind }: { label: string; kind: PullIndicatorKind }) {
  return (
    <GlassSurface fallback="surface-control" className="h-button flex-row items-center gap-sm rounded-full px-md">
      <Lead kind={kind} />
      <Text variant="body-strong">{label}</Text>
    </GlassSurface>
  );
}
