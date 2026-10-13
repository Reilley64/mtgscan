import { ChipGroup, type SingleChoiceProps } from '@/components/molecules/chip-group';
import { DrawerSheet } from '@/components/templates/drawer-sheet';

export function ChoiceSheet<Value extends string>({ title, ...choice }: { title: string } & SingleChoiceProps<Value>) {
  return (
    <DrawerSheet title={title}>
      <ChipGroup {...choice} />
    </DrawerSheet>
  );
}
