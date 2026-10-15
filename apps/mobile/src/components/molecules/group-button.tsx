import { FloatingMenuButton } from '@/components/atoms/floating-menu-button';

type GroupButtonProps<Grouping extends string> = {
  groupings: { grouping: Grouping; title: string }[];
  grouping: Grouping;
  active: boolean;
  onSelect: (grouping: Grouping) => void;
};

export function GroupButton<Grouping extends string>({ groupings, grouping, active, onSelect }: GroupButtonProps<Grouping>) {
  return (
    <FloatingMenuButton
      symbol="rectangle.3.group"
      active={active}
      accessibilityLabel={`Group, ${groupings.find((choice) => choice.grouping === grouping)?.title}`}
      menuTitle="Group by"
      choices={groupings.map((choice) => ({
        title: choice.title,
        checked: choice.grouping === grouping,
        onSelect: () => onSelect(choice.grouping),
      }))}
    />
  );
}
