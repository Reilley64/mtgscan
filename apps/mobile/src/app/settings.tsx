import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { signOut, useSession } from '@/auth/session';
import { currentSignInProviderName } from '@/auth/sign-in';
import { SecondaryButton } from '@/components/secondary-button';
import { Text as ClassText } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { GalleryRow } from '@/gallery/gallery-row';
import { colors, rounded, sizes, spacing, typography } from '@/theme';

export default function SettingsDrawer() {
  const user = useSession()?.user;
  const providerName = user ? currentSignInProviderName(user) : '';
  const [spikeToggleOn, setSpikeToggleOn] = useState(false);

  return (
    <ScrollView
      style={styles.sheet}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <Text accessibilityRole="header" style={styles.title}>
        Settings
      </Text>
      <View style={styles.account}>
        <Text style={styles.accountProvider}>Signed in with {providerName}</Text>
        {user?.email && <Text style={styles.accountEmail}>{user.email}</Text>}
      </View>
      <GalleryRow />
      <Toggle accessibilityLabel="Spike toggle" pressed={spikeToggleOn} onPressedChange={setSpikeToggleOn}>
        <ClassText>Spike toggle</ClassText>
      </Toggle>
      <SecondaryButton label="Sign out" onPress={signOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.sheet,
  },
  content: {
    gap: spacing.lg,
    padding: spacing.lg,
    paddingTop: spacing.lg * 2,
  },
  title: {
    ...typography.sheetTitle,
    color: colors.text,
    textAlign: 'center',
  },
  account: {
    gap: spacing.xs,
    padding: sizes.cardPadding,
    borderRadius: rounded.md,
    backgroundColor: colors.surface,
  },
  accountProvider: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  accountEmail: {
    ...typography.meta,
    color: colors.textMuted,
  },
});
