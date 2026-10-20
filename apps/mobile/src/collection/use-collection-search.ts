import { useFocusEffect } from 'expo-router';
import type { SearchBarCommands, SearchBarProps } from 'react-native-screens';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { DeckRow } from '@mtgscan/supabase/decks';

import {
  chipBeforeSpace,
  collectionSearchQuery,
  committedChip,
  isTypedDeckChip,
  splitLastToken,
  type SearchChip,
  type SearchSuggestion,
} from '@/collection/collection-search';
import { usePriceCurrency } from '@/collection/price-currency-setting';
import { useSearchSuggestions } from '@/collection/use-search-suggestions';
import { useDecks } from '@/decks/use-decks';
import { useTypingPause } from '@/lib/read';

const emptyFieldMark = '\u200b';

const noChipFields = new Map<string, number>();

const noDecks: DeckRow[] = [];

export function useCollectionSearch() {
  const field = useRef<SearchBarCommands>(null);
  const [text, setText] = useState('');
  const [chips, setChips] = useState<SearchChip[]>([]);
  const [typing, setTyping] = useState(false);
  const [searchedText, searchNow] = useTypingPause(text);

  useFocusEffect(useCallback(() => () => field.current?.blur(), []));

  function showInField(nextText: string, nextChips: SearchChip[]) {
    field.current?.setText((nextChips.length > 0 ? emptyFieldMark : '') + nextText);
  }

  function change(nextText: string, nextChips: SearchChip[]) {
    setText(nextText);
    setChips(nextChips);
    searchNow(nextText);
    showInField(nextText, nextChips);
  }

  function onChangeText(fieldText: string) {
    const typed = fieldText.replaceAll(emptyFieldMark, '');
    if (fieldText === '' && text === '' && chips.length > 0) {
      change('', chips.slice(0, -1));
      return;
    }
    setTyping(typed !== '');
    const committed = chipBeforeSpace(typed);
    if (committed) {
      change(committed.before, [...chips, committed.chip]);
      return;
    }
    setText(typed);
    if (fieldText === '' && chips.length > 0) {
      showInField('', chips);
    }
  }

  function onSearchButtonPress() {
    setTyping(false);
    const committed = committedChip(text);
    change(committed ? committed.before : text, committed ? [...chips, committed.chip] : chips);
  }

  function pick(suggestion: SearchSuggestion) {
    const { before } = splitLastToken(text);
    change(before + (suggestion.chip ? '' : suggestion.title), suggestion.chip ? [...chips, suggestion.chip] : chips);
  }

  function removeChip(index: number) {
    change(text, chips.filter((_, chipIndex) => chipIndex !== index));
  }

  function replaceChips(nextChips: SearchChip[]) {
    change(text, nextChips);
  }

  const searchBar: SearchBarProps = {
    ref: field,
    placeholder: 'Search your collection',
    autoCapitalize: 'none',
    onChangeText: (event) => onChangeText(event.nativeEvent.text),
    onSearchButtonPress,
    onBlur: () => setTyping(false),
    onCancelButtonPress: () => {
      setTyping(false);
      change('', []);
    },
  };

  const suggestions = useSearchSuggestions(typing ? splitLastToken(text).token : '');
  const { priceCurrency } = usePriceCurrency();
  const needsDecks = chips.some(isTypedDeckChip);
  const { read: decksRead, reload: reloadDecks } = useDecks(needsDecks);
  const decks = !needsDecks ? noDecks : decksRead.status === 'loaded' ? decksRead.decks : null;
  const searched = useMemo(
    () => priceCurrency && decks && collectionSearchQuery(searchedText, chips, priceCurrency, decks),
    [searchedText, chips, priceCurrency, decks],
  );

  return {
    searchBar,
    chips,
    removeChip,
    replaceChips,
    suggestions,
    pick,
    query: searched && searched.refusedChipIndex === undefined ? searched.query : null,
    chipIndexOfField: searched?.chipIndexOfField ?? noChipFields,
    refusedChipIndex: searched?.refusedChipIndex,
    decksFailed: needsDecks && decksRead.status === 'failed',
    reloadDecks,
    typing,
    searching: searched?.query.text !== undefined || chips.length > 0,
  };
}
