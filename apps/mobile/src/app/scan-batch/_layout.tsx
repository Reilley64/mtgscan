import { Stack } from 'expo-router';

import { drawerStackOptions, pushedDrawerScreenOptions } from '@/components/templates/drawer-sheet';

export default function BatchReviewStack() {
  return (
    <Stack screenOptions={drawerStackOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="scan-details" options={pushedDrawerScreenOptions} />
    </Stack>
  );
}
