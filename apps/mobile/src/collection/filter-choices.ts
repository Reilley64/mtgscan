import { chipLabel, conditionChipValue, keyValueChip, type SearchChip } from '@/collection/collection-search';
import { conditionLabels, conditions, finishLabels, finishes, languageNames, languages } from '@/collection/copy-labels';

type FilterChoice = { label: string; chips: SearchChip[] };

export type SingleChoiceFilter = { title: string; owns: (chip: SearchChip) => boolean; choices: FilterChoice[] };

function sameChip(chip: SearchChip, other: SearchChip) {
  return chipLabel(chip).toLowerCase() === chipLabel(other).toLowerCase();
}

function anyOrOne(title: string, key: SearchChip['key'], values: [string, string][]): SingleChoiceFilter {
  return {
    title,
    owns: (chip) => chip.key === key,
    choices: [{ label: 'Any', chips: [] }, ...values.map(([value, label]) => ({ label, chips: [keyValueChip(key, value)] }))],
  };
}

const freeChoice: FilterChoice = { label: 'Free', chips: [keyValueChip('is', 'free'), keyValueChip('is', 'protected', true)] };

export const showFilter: SingleChoiceFilter = {
  title: 'Show',
  owns: (chip) => chip.key === 'is' && (chip.value === 'free' || chip.value === 'protected'),
  choices: [{ label: 'All', chips: [] }, freeChoice, { label: 'Protected', chips: [keyValueChip('is', 'protected')] }],
};

export const copyFilters: SingleChoiceFilter[] = [
  anyOrOne(
    'Finish',
    'finish',
    finishes.map((finish) => [finish, finishLabels[finish]]),
  ),
  anyOrOne(
    'Condition',
    'condition',
    conditions.map((condition) => [conditionChipValue(condition), conditionLabels[condition]]),
  ),
  anyOrOne(
    'Language',
    'lang',
    languages.map((language) => [language, languageNames[language]]),
  ),
];

export function isChosen(filter: SingleChoiceFilter, choice: FilterChoice, chips: SearchChip[]) {
  const owned = chips.filter(filter.owns);
  return owned.length === choice.chips.length && choice.chips.every((chip) => owned.some((other) => sameChip(chip, other)));
}

export function withChoice(filter: SingleChoiceFilter, choice: FilterChoice, chips: SearchChip[]) {
  return [...chips.filter((chip) => !filter.owns(chip)), ...choice.chips];
}

export function hasUserTagChip(chips: SearchChip[], name: string, negated: boolean) {
  const userTagChip = keyValueChip('user_tag', name, negated);
  return chips.some((chip) => sameChip(chip, userTagChip));
}

export function withUserTagChipToggled(chips: SearchChip[], name: string, negated: boolean) {
  const userTagChip = keyValueChip('user_tag', name, negated);
  const opposite = keyValueChip('user_tag', name, !negated);
  return hasUserTagChip(chips, name, negated)
    ? chips.filter((chip) => !sameChip(chip, userTagChip))
    : [...chips.filter((chip) => !sameChip(chip, opposite)), userTagChip];
}

export function activeFilterCount(chips: SearchChip[]) {
  return isChosen(showFilter, freeChoice, chips) ? chips.length - 1 : chips.length;
}
