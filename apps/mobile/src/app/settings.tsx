import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { signOut } from '@/auth/google-sign-in';
import { useSession } from '@/auth/session';
import { colors, rounded, sizes, spacing, typography } from '@/theme';

const providerNames: Record<string, string> = {
  apple: 'Apple',
  google: 'Google',
};

export default function SettingsSheet() {
  const user = useSession()?.user;
  const provider = user?.app_metadata.provider;

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
          <Text style={styles.accountProvider}>
            Signed in with {provider ? (providerNames[provider] ?? provider) : 'an unknown provider'}
          </Text>
          {user?.email && <Text style={styles.accountEmail}>{user.email}</Text>}
        </View>
        <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOut}>
          <Text style={styles.signOutLabel}>Sign out</Text>
        </Pressable>
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
    padding: spacing.md,
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
  signOut: {
    height: sizes.button,
    borderRadius: rounded.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceControl,
  },
  signOutLabel: {
    ...typography.bodyStrong,
    color: colors.text,
  },
});
