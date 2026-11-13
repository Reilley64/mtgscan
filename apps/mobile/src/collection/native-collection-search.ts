import { usdExchangeRate } from '@mtgscan/supabase/converted-prices';
import { chipBeforeSpace, chipLabel, chipSuggestion, collectionSearchQuery, committedChip, fixedSuggestions, refusedChipMessage, splitLastToken, typedValue, type SearchChip, type SearchSuggestion } from './collection-search';
import { collectionOrderQuery, collectionSorts, defaultCollectionOrder, nextCollectionOrder, spokenCollectionOrder, type CollectionOrder } from './collection-sort';
import { activeFilterCount, copyFilters, hasUserTagChip, isChosen, showFilter, withChoice, withUserTagChipToggled } from './filter-choices';

export type NativeSearchState = { text: string; chips: SearchChip[]; order: CollectionOrder };
export type NativeSearchCommand =
  | { kind: 'text'; text: string }
  | { kind: 'filter'; section: number; index: number }
  | { kind: 'sort'; sort: CollectionOrder['sort'] }
  | { kind: 'submit' | 'cancel' | 'backspace' }
  | { kind: 'remove' | 'suggestion'; index: number }
  | { kind: 'userTag'; name: string; negated: boolean };
export type NativeSearchInput = {
  state?: NativeSearchState;
  command?: NativeSearchCommand;
  decks?: { deck_id: string; name: string }[];
  userTags?: string[];
  field?: string;
};

function suggestionsFor(text: string, input: NativeSearchInput): SearchSuggestion[] {
  const { token } = splitLastToken(text);
  const typed = typedValue(token);
  if (typed?.key === 'deck') return (input.decks ?? [])
    .filter((deck) => deck.name.toLowerCase().includes(typed.value.toLowerCase()))
    .map((deck) => ({ title: chipLabel({ key: 'deck', negated: typed.negated, operator: ':', value: deck.name, deckId: deck.deck_id }), chip: { key: 'deck', negated: typed.negated, operator: ':', value: deck.name, deckId: deck.deck_id } }));
  if (typed?.key === 'user_tag') return (input.userTags ?? [])
    .filter((name) => name.toLowerCase().includes(typed.value.toLowerCase()))
    .map((name) => chipSuggestion(typed, name));
  return fixedSuggestions(token);
}

export function nativeCollectionSearch(input: NativeSearchInput) {
  const state = { ...(input.state ?? { text: '', chips: [], order: defaultCollectionOrder }) };
  if (input.command?.kind === 'text') {
    state.text = input.command.text ?? '';
    const committed = chipBeforeSpace(state.text);
    if (committed) {
      state.text = committed.before;
      state.chips = [...state.chips, committed.chip];
    }
  }
  if (input.command?.kind === 'filter') {
    const filter = [showFilter, ...copyFilters][input.command.section];
    const choice = filter?.choices[input.command.index];
    if (choice) state.chips = withChoice(filter, choice, state.chips);
  }
  if (input.command?.kind === 'sort') state.order = nextCollectionOrder(state.order, input.command.sort);
  if (input.command?.kind === 'submit') {
    const committed = committedChip(state.text);
    if (committed) { state.text = committed.before; state.chips = [...state.chips, committed.chip]; }
  }
  if (input.command?.kind === 'cancel') { state.text = ''; state.chips = []; }
  if (input.command?.kind === 'remove') {
    const removed = input.command.index;
    state.chips = state.chips.filter((_, index) => index !== removed);
  }
  if (input.command?.kind === 'backspace' && state.text === '') state.chips = state.chips.slice(0, -1);
  if (input.command?.kind === 'userTag') state.chips = withUserTagChipToggled(state.chips, input.command.name, input.command.negated);
  if (input.command?.kind === 'suggestion') {
    const suggestion = suggestionsFor(state.text, input)[input.command.index];
    if (suggestion) {
      const { before } = splitLastToken(state.text);
      state.text = suggestion.chip ? before : before + suggestion.title;
      if (suggestion.chip) state.chips = [...state.chips, suggestion.chip];
    }
  }
  const compiled = collectionSearchQuery(state.text, state.chips, usdExchangeRate, input.decks ?? []);
  const refusedIndex = compiled.refusedChipIndex ?? (input.field ? compiled.chipIndexOfField.get(input.field) : undefined);
  Object.assign(compiled.query, collectionOrderQuery(state.order));
  return {
    state,
    query: compiled.query,
    queryJSON: JSON.stringify(compiled.query),
    stateJSON: JSON.stringify(state),
    chipLabels: state.chips.map(chipLabel),
    filterCount: activeFilterCount(state.chips),
    refusedIndex,
    refusalMessage: refusedIndex === undefined ? undefined : refusedChipMessage(state.chips[refusedIndex]),
    searching: compiled.query.text !== undefined || state.chips.length > 0,
    suggestions: suggestionsFor(state.text, input).map(({ title, detail }) => ({ title, detail })),
    userTagFilters: (input.userTags ?? []).map((name) => ({ name, included: hasUserTagChip(state.chips, name, false), excluded: hasUserTagChip(state.chips, name, true) })),
    filters: [showFilter, ...copyFilters].map((filter) => ({ title: filter.title, choices: filter.choices.map((choice) => ({ label: choice.label, selected: isChosen(filter, choice, state.chips) })) })),
    sorts: collectionSorts.map((sort) => ({ ...sort, selected: sort.sort === state.order.sort, direction: sort.sort === state.order.sort && 'direction' in state.order ? state.order.direction : undefined })),
    sortLabel: spokenCollectionOrder(state.order),
  };
}
