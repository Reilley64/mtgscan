import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/atoms/text';
import { TextLink } from '@/components/atoms/text-link';
import { shadows } from '@/theme';

type SignInSheetProps = {
  onOpenPrivacyPolicy: () => void;
  children: ReactNode;
};

export function SignInSheet({ onOpenPrivacyPolicy, children }: SignInSheetProps) {
  return (
    <View style={styles.shadow} className="mt-auto rounded-t-md bg-sheet px-lg pb-safe-or-lg pt-sm">
      <View className="mb-md h-grabber-height w-grabber-width self-center rounded-full bg-grabber" />
      <Text variant="sign-in-title" className="mx-xs mb-xs">
        Every card you own, in one binder.
      </Text>
      <Text className="mx-xs mb-lg text-text-muted">
        Scan your cards, see what each one is worth, and build Commander decks from them.
      </Text>
      <View className="gap-sm">{children}</View>
      <Text variant="meta" className="mt-md text-center text-text-dim">
        Your collection and decks stay private. <TextLink onPress={onOpenPrivacyPolicy}>Privacy policy</TextLink>
      </Text>
      <Text variant="credit" className="mb-xs mt-sm text-center">
        Card images from Scryfall
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    boxShadow: shadows.sheet,
  },
});
