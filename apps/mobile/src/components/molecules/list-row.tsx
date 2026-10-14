import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Surface } from '@/components/atoms/surface';
import { SymbolView } from '@/components/atoms/symbol-view';
import { Text } from '@/components/atoms/text';
import { cn } from '@/lib/class-names';
import { sizes } from '@/theme';

const rowClass = 'flex-row items-center gap-md p-sm';

type ListRowProps = {
  title: string;
  detail?: string;
} & (
  | { leading?: ReactNode; checked?: never; onPress?: () => void }
  | { leading?: never; checked: boolean; onPress: () => void }
);

export function ListRow({ title, detail, leading, checked, onPress }: ListRowProps) {
  const label = detail ? `${title}, ${detail}` : title;
  const checkRow = checked !== undefined;
  const content = (
    <>
      {checkRow ? (
        <SymbolView
          name={checked ? 'checkmark.circle.fill' : 'circle'}
          size={sizes.rowSymbol}
          className="text-text-dim group-aria-checked:text-primary"
        />
      ) : (
        leading
      )}
      <View className="flex-1 gap-xs">
        <Text variant="body-strong" numberOfLines={1}>
          {title}
        </Text>
        {detail ? <Text variant="meta">{detail}</Text> : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Surface
        accessibilityLabel={label}
        accessibilityRole={checkRow ? 'checkbox' : 'button'}
        aria-checked={checked}
        onPress={onPress}
        className={cn(rowClass, 'group')}>
        {content}
      </Surface>
    );
  }
  return (
    <Surface accessible accessibilityLabel={label} className={rowClass}>
      {content}
    </Surface>
  );
}
