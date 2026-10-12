import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { ListRow } from '@/components/molecules/list-row';
import { DrawerSheet } from '@/components/templates/drawer-sheet';

export function DrawerSheetSample() {
  return (
    <DrawerSheet title="Drawer sheet">
      <Surface className="gap-xs">
        <Text variant="body-strong">The title stays at the top.</Text>
        <Text variant="meta">The content below it scrolls at half and full height.</Text>
      </Surface>
      {Array.from({ length: 12 }, (_, index) => (
        <ListRow key={index} title={`Row ${index + 1}`} />
      ))}
    </DrawerSheet>
  );
}
