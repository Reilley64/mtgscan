import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Surface } from '@/components/atoms/surface';
import { SymbolView } from '@/components/atoms/symbol-view';
import { Text } from '@/components/atoms/text';
import { sizes } from '@/theme';

const rowClass = 'flex-row items-center gap-md p-sm';

const checkMarkTints = cva('', {
  variants: {
    checked: {
      true: 'text-primary',
      false: 'text-text-dim',
    },
  },
});

function CheckMark({ checked }: { checked: boolean }) {
  return (
    <SymbolView
      name={checked ? 'checkmark.circle.fill' : 'circle'}
      size={sizes.checkMark}
      className={checkMarkTints({ checked })}
    />
  );
}

type ListRowProps = {
  title: string;
  detail?: string;
  leading?: ReactNode;
  checked?: boolean;
  onPress?: () => void;
};

export function ListRow({ title, detail, leading, checked, onPress }: ListRowProps) {
  const label = detail ? `${title}, ${detail}` : title;
  const content = (
    <>
      {checked === undefined ? leading : <CheckMark checked={checked} />}
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
        accessibilityRole={checked === undefined ? 'button' : 'checkbox'}
        aria-checked={checked}
        onPress={onPress}
        className={rowClass}>
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
