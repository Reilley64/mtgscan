import type { UserTagRow } from '@mtgscan/supabase/collection';
import { usdExchangeRate } from '@mtgscan/supabase/converted-prices';
import type { DeckCommander, DeckRow } from '@mtgscan/supabase/decks';

import { chipBeforeSpace, chipLabel, chipSuggestion, collectionSearchQuery, committedChip, fixedSuggestions, keyValueChip, refusedChipMessage, splitLastToken, typedValue, type SearchChip, type SearchSuggestion, type TypedValue } from './collection-search';
import { collectionOrderQuery, collectionSorts, defaultCollectionOrder, nextCollectionOrder, spokenCollectionOrder, type CollectionOrder } from './collection-sort';
import { activeFilterCount, copyFilters, hasUserTagChip, isChosen, showFilter, withChoice, withUserTagChipToggled } from './filter-choices';
import { shownCopyCount } from './total-labels';
import { userTagSuggestionMatches } from './user-tag-names';

type NativeSearchState = { text: string; chips: SearchChip[]; order: CollectionOrder };
type NativeSearchCommand =
  | { kind: 'text'; text: string }
  | { kind: 'filter'; section: number; index: number }
  | { kind: 'sort'; sort: CollectionOrder['sort'] }
  | { kind: 'submit' | 'cancel' | 'backspace' }
  | { kind: 'remove' | 'suggestion'; index: number }
  | { kind: 'userTag'; name: string; negated: boolean };
type LiveLookup = { key: 'set' | 'tag'; value: string; token: string };
type LiveSuggestions = { lookup: LiveLookup; items: { value: string; detail: string }[] };

export type NativeSearchInput = {
  state?: NativeSearchState;
  command?: NativeSearchCommand;
  decks?: (Pick<DeckRow, 'deck_id' | 'name'> & { commander_art_crop_uri?: DeckCommander['art_crop_uri'] })[];
  userTags?: string[];
  userTagDetails?: UserTagRow[];
  field?: string;
  liveSuggestions?: LiveSuggestions;
};

function liveLookup(token: string, typed: TypedValue | null): LiveLookup | undefined {
  if (typed?.value && (typed.key === 'set' || typed.key === 'tag')) {
    return { key: typed.key, value: typed.value, token };
  }
}

function suggestionsFor(text: string, input: NativeSearchInput) {
  const { before, token } = splitLastToken(text);
  const typed = typedValue(token);
  const lookup = liveLookup(token, typed);
  return { before, lookup, rows: suggestionRows(token, typed, lookup, input) };
}

function suggestionRows(token: string, typed: TypedValue | null, lookup: LiveLookup | undefined, input: NativeSearchInput): SearchSuggestion[] {
  const live = input.liveSuggestions;
  if (typed && lookup && live?.lookup.token === token) {
    return [...fixedSuggestions(token), ...live.items.map(({ value, detail }) => chipSuggestion(typed, value, detail))];
  }
  if (typed?.key === 'deck') return (input.decks ?? [])
    .filter((deck) => deck.name.toLowerCase().includes(typed.value.toLowerCase()))
    .map((deck) => {
      const chip = { ...keyValueChip('deck', deck.name, typed.negated), deckId: deck.deck_id };
      return { title: chipLabel(chip), chip, avatar: { uri: deck.commander_art_crop_uri ?? null } };
    });
  if (typed?.key === 'user_tag') {
    const tags: (Pick<UserTagRow, 'name'> & Partial<Pick<UserTagRow, 'copy_count'>>)[] = input.userTagDetails ?? (input.userTags ?? []).map((name) => ({ name }));
    return userTagSuggestionMatches(tags, typed.value)
      .map(({ name, copy_count }) => chipSuggestion(typed, name, copy_count === undefined ? undefined : shownCopyCount(copy_count)));
  }
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
    const { before, rows } = suggestionsFor(state.text, input);
    const suggestion = rows[input.command.index];
    if (suggestion) {
      state.text = suggestion.chip ? before : before + suggestion.title;
      if (suggestion.chip) state.chips = [...state.chips, suggestion.chip];
    }
  }
  const compiled = collectionSearchQuery(state.text, state.chips, usdExchangeRate, input.decks ?? []);
  const refusedIndex = compiled.refusedChipIndex ?? (input.field ? compiled.chipIndexOfField.get(input.field) : undefined);
  Object.assign(compiled.query, collectionOrderQuery(state.order));
  const { lookup, rows } = suggestionsFor(state.text, input);
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
    lookup,
    suggestions: rows.map(({ title, detail, avatar }) => ({ title, detail, avatar })),
    userTagFilters: (input.userTags ?? []).map((name) => ({ name, included: hasUserTagChip(state.chips, name, false), excluded: hasUserTagChip(state.chips, name, true) })),
    filters: [showFilter, ...copyFilters].map((filter) => ({ title: filter.title, choices: filter.choices.map((choice) => ({ label: choice.label, selected: isChosen(filter, choice, state.chips) })) })),
    sorts: collectionSorts.map((sort) => ({ ...sort, selected: sort.sort === state.order.sort, direction: sort.sort === state.order.sort && 'direction' in state.order ? state.order.direction : undefined })),
    sortLabel: spokenCollectionOrder(state.order),
  };
}
