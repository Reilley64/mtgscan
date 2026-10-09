import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { signOut, useSession } from '@/auth/session';
import { currentSignInProviderName } from '@/auth/sign-in';
import { SecondaryButton } from '@/components/secondary-button';
import { colors, rounded, sizes, spacing, typography } from '@/theme';

export default function SettingsSheet() {
  const user = useSession()?.user;
  const providerName = user ? currentSignInProviderName(user) : '';

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Settings
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          hitSlop={spacing.sm}
          style={styles.done}>
          <Text style={styles.doneLabel}>Done</Text>
        </Pressable>
      </View>
      <View style={styles.content}>
        <View style={styles.account}>
          <Text style={styles.accountProvider}>Signed in with {providerName}</Text>
          {user?.email && <Text style={styles.accountEmail}>{user.email}</Text>}
        </View>
        <SecondaryButton label="Sign out" onPress={signOut} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.sheet,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  title: {
    ...typography.sheetTitle,
    color: colors.text,
  },
  done: {
    position: 'absolute',
    right: spacing.lg,
  },
  doneLabel: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  content: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
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
