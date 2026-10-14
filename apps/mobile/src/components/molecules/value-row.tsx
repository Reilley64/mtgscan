import type { ReactNode } from 'react';

import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';

type ValueRowProps = {
  label: string;
  spokenValue: string;
  accessibilityHint?: string;
  children: ReactNode;
};

export function ValueRow({ label, spokenValue, accessibilityHint, children }: ValueRowProps) {
  return (
    <Surface
      accessible
      accessibilityLabel={`${label}, ${spokenValue}`}
      accessibilityHint={accessibilityHint}
      className="flex-row items-center justify-between gap-md">
      <Text className="text-text-muted">{label}</Text>
      {children}
    </Surface>
  );
}
