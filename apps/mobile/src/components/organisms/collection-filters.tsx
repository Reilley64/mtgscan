import type { SearchChip } from '@/collection/collection-search';
import {
  copyFilters,
  hasUserTagChip,
  isChosen,
  showFilter,
  withChoice,
  withUserTagChipToggled,
  type SingleChoiceFilter,
} from '@/collection/filter-choices';
import { SelectableChips } from '@/components/molecules/chip-group';
import { SheetSection } from '@/components/molecules/sheet-section';

type CollectionFiltersProps = {
  chips: SearchChip[];
  userTagNames: string[];
  onChange: (chips: SearchChip[]) => void;
};

export function CollectionFilters({ chips, userTagNames, onChange }: CollectionFiltersProps) {
  function singleChoiceSection(filter: SingleChoiceFilter) {
    return (
      <SheetSection key={filter.title} title={filter.title}>
        <SelectableChips
          chips={filter.choices.map((choice) => ({
            label: choice.label,
            selected: isChosen(filter, choice, chips),
            onPress: () => onChange(withChoice(filter, choice, chips)),
          }))}
        />
      </SheetSection>
    );
  }

  function userTagSection(title: string, negated: boolean) {
    return (
      <SheetSection title={title}>
        <SelectableChips
          chips={userTagNames.map((name) => ({
            label: name,
            selected: hasUserTagChip(chips, name, negated),
            onPress: () => onChange(withUserTagChipToggled(chips, name, negated)),
          }))}
        />
      </SheetSection>
    );
  }

  return (
    <>
      {singleChoiceSection(showFilter)}
      {userTagNames.length > 0 ? (
        <>
          {userTagSection('With user tags', false)}
          {userTagSection('Without user tags', true)}
        </>
      ) : null}
      {copyFilters.map(singleChoiceSection)}
    </>
  );
}
