import { Stack } from 'expo-router';

import {
  drawerStackOptions,
  pushedDrawerScreenOptions,
  titledDrawerScreenOptions,
} from '@/components/templates/drawer-sheet';

export default function BatchReviewStack() {
  return (
    <Stack screenOptions={drawerStackOptions}>
      <Stack.Screen name="index" options={titledDrawerScreenOptions} />
      <Stack.Screen name="scan-details" options={pushedDrawerScreenOptions} />
    </Stack>
  );
}
