import { router, useLocalSearchParams } from 'expo-router';

import { ScanDetails } from '@/components/organisms/scan-details';
import { DrawerSheet } from '@/components/templates/drawer-sheet';

export default function ScanDetailsSheet() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();

  return (
    <DrawerSheet>
      <ScanDetails scanId={scanId} onRemove={() => router.back()} />
    </DrawerSheet>
  );
}
