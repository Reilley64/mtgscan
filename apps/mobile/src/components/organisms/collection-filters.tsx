import { View } from 'react-native';

import {
  copyFilters,
  hasChip,
  isChosen,
  showFilter,
  userTagChip,
  withChipToggled,
  withChoice,
  type SingleChoiceFilter,
} from '@/collection/collection-filters';
import type { SearchChip } from '@/collection/collection-search';
import { Chip } from '@/components/atoms/chip';
import { SheetSection } from '@/components/molecules/sheet-section';

type FilterChip = { label: string; selected: boolean; onPress: () => void };

function FilterSection({ title, chips }: { title: string; chips: FilterChip[] }) {
  return (
    <SheetSection title={title}>
      <View className="flex-row flex-wrap gap-sm">
        {chips.map(({ label, selected, onPress }) => (
          <Chip key={label} label={label} selected={selected} onPress={onPress} />
        ))}
      </View>
    </SheetSection>
  );
}

type CollectionFiltersProps = {
  chips: SearchChip[];
  userTagNames: string[];
  onChange: (chips: SearchChip[]) => void;
};

export function CollectionFilters({ chips, userTagNames, onChange }: CollectionFiltersProps) {
  function singleChoiceSection(filter: SingleChoiceFilter) {
    return (
      <FilterSection
        key={filter.title}
        title={filter.title}
        chips={filter.choices.map((choice) => ({
          label: choice.label,
          selected: isChosen(filter, choice, chips),
          onPress: () => onChange(withChoice(filter, choice, chips)),
        }))}
      />
    );
  }

  function userTagSection(title: string, negated: boolean) {
    return (
      <FilterSection
        title={title}
        chips={userTagNames.map((name) => ({
          label: name,
          selected: hasChip(chips, userTagChip(name, negated)),
          onPress: () => onChange(withChipToggled(chips, userTagChip(name, negated))),
        }))}
      />
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
