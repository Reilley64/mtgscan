import type { ReactNode } from 'react';
import { Text as NativeText } from 'react-native';

type TextLinkProps = {
  onPress: () => void;
  children: ReactNode;
};

export function TextLink({ onPress, children }: TextLinkProps) {
  return (
    <NativeText accessibilityRole="link" onPress={onPress} className="font-bold text-primary">
      {children}
    </NativeText>
  );
}
