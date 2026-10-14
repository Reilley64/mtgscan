import { Stack } from 'expo-router';

import { drawerStackOptions, pushedDrawerScreenOptions } from '@/components/templates/drawer-sheet';

export default function SettingsStack() {
  return (
    <Stack screenOptions={drawerStackOptions}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="currency" options={pushedDrawerScreenOptions} />
    </Stack>
  );
}
