import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { signOut, useSession } from '@/auth/session';
import { currentSignInProviderName } from '@/auth/sign-in';
import { SecondaryButton } from '@/components/secondary-button';
import { GalleryRow } from '@/gallery/gallery-row';
import { useScanSounds } from '@/scan/scan-sounds-setting';
import { colors, rounded, sizes, spacing, typography } from '@/theme';

function ScanSoundsRow() {
  const { scanSounds, setScanSounds } = useScanSounds();
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>Scan sounds</Text>
      <Switch
        accessibilityLabel="Scan sounds"
        value={scanSounds}
        onValueChange={setScanSounds}
        trackColor={{ true: colors.primary, false: colors.surfaceControl }}
      />
    </View>
  );
}

export default function SettingsDrawer() {
  const user = useSession()?.user;
  const providerName = user ? currentSignInProviderName(user) : '';

  return (
    <View style={styles.sheet}>
      <Text accessibilityRole="header" style={styles.title}>
        Settings
      </Text>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic">
        <View style={styles.account}>
          <Text style={styles.accountProvider}>Signed in with {providerName}</Text>
          {user?.email && <Text style={styles.accountEmail}>{user.email}</Text>}
        </View>
        <GalleryRow />
        <ScanSoundsRow />
        <SecondaryButton label="Sign out" onPress={signOut} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.sheet,
  },
  title: {
    ...typography.sheetTitle,
    color: colors.text,
    textAlign: 'center',
    paddingTop: spacing.lg * 2,
    paddingBottom: spacing.lg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: sizes.cardPadding,
    borderRadius: rounded.md,
    backgroundColor: colors.surface,
  },
  rowTitle: {
    ...typography.bodyStrong,
    flex: 1,
    color: colors.text,
  },
});
