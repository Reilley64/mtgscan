import { router } from 'expo-router';

import { Button } from '@/components/atoms/button';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { ListRow } from '@/components/molecules/list-row';
import { DrawerSheet } from '@/components/templates/drawer-sheet';

export function DrawerSheetSample({ fullHeight = false }: { fullHeight?: boolean }) {
  return (
    <DrawerSheet
      title={fullHeight ? 'Full-height drawer sheet' : 'Drawer sheet'}
      footer={
        <Button variant="primary" onPress={() => router.back()}>
          <Text>The footer stays at the bottom</Text>
        </Button>
      }>
      <Surface className="gap-xs">
        <Text variant="body-strong">The title stays at the top.</Text>
        <Text variant="meta">
          {fullHeight
            ? 'It opens at full height only. The content below it scrolls.'
            : 'The content below it scrolls at half and full height.'}
        </Text>
      </Surface>
      {Array.from({ length: 12 }, (_, index) => (
        <ListRow key={index} title={`Row ${index + 1}`} />
      ))}
    </DrawerSheet>
  );
}
