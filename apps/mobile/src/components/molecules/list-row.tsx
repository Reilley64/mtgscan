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
  spokenBefore?: string;
  trailing?: { content: ReactNode; spoken: string };
} & (
  | { leading?: ReactNode; checked?: never; onPress?: () => void; menu?: never }
  | { leading?: never; checked: boolean; onPress: () => void; menu?: ReactNode }
);

export function ListRow({ title, detail, spokenBefore, trailing, menu, leading, checked, onPress }: ListRowProps) {
  const label = [spokenBefore, title, detail, trailing?.spoken].filter(Boolean).join(', ');
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
      {trailing?.content}
    </>
  );

  if (onPress) {
    const row = (
      <Surface
        accessibilityLabel={label}
        accessibilityRole={checkRow ? 'checkbox' : 'button'}
        aria-checked={checked}
        onPress={onPress}
        className={cn(rowClass, 'group', menu ? 'flex-1' : undefined)}>
        {content}
      </Surface>
    );
    return menu ? <Surface className="flex-row items-center p-0 pr-xs">{row}{menu}</Surface> : row;
  }
  return (
    <Surface accessible accessibilityLabel={label} className={rowClass}>
      {content}
    </Surface>
  );
}
