import { ScrollView, StyleSheet, Switch, Text as NativeText, View } from 'react-native';

import { signOut, useSession } from '@/auth/session';
import { currentSignInProviderName } from '@/auth/sign-in';
import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { GalleryRow } from '@/gallery/gallery-row';
import { useScanSounds } from '@/scan/scan-sounds-setting';
import { colors, rounded, sizes, spacing, typography } from '@/theme';

function ScanSoundsRow() {
  const { scanSounds, setScanSounds } = useScanSounds();
  return (
    <View style={styles.row}>
      <NativeText style={styles.rowTitle}>Scan sounds</NativeText>
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
    <>
      <View collapsable={false} style={styles.titleBar}>
        <NativeText accessibilityRole="header" style={styles.title}>
          Settings
        </NativeText>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic">
        <View style={styles.account}>
          <NativeText style={styles.accountProvider}>Signed in with {providerName}</NativeText>
          {user?.email && <NativeText style={styles.accountEmail}>{user.email}</NativeText>}
        </View>
        <GalleryRow />
        <ScanSoundsRow />
        <Button onPress={signOut}>
          <Text>Sign out</Text>
        </Button>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  titleBar: {
    paddingTop: spacing.lg * 2,
    paddingBottom: spacing.lg,
    backgroundColor: colors.sheet,
  },
  title: {
    ...typography.sheetTitle,
    color: colors.text,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.sheet,
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
