import type { SearchBarCommands, SearchBarProps } from 'react-native-screens';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  chipBeforeSpace,
  collectionSearchQuery,
  committedChip,
  splitLastToken,
  type SearchChip,
  type SearchSuggestion,
} from '@/collection/collection-search';
import { useSearchSuggestions } from '@/collection/use-search-suggestions';

const emptyFieldMark = '\u200b';

const typingPause = 300;

export function useCollectionSearch() {
  const field = useRef<SearchBarCommands>(null);
  const pause = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [text, setText] = useState('');
  const [chips, setChips] = useState<SearchChip[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [searchedText, setSearchedText] = useState('');

  useEffect(() => () => clearTimeout(pause.current), []);

  function showInField(nextText: string, nextChips: SearchChip[]) {
    field.current?.setText((nextChips.length > 0 ? emptyFieldMark : '') + nextText);
  }

  function change(nextText: string, nextChips: SearchChip[]) {
    clearTimeout(pause.current);
    setText(nextText);
    setChips(nextChips);
    setSearchedText(nextText);
    showInField(nextText, nextChips);
  }

  function onChangeText(fieldText: string) {
    const typed = fieldText.replaceAll(emptyFieldMark, '');
    if (fieldText === '' && text === '' && chips.length > 0) {
      change('', chips.slice(0, -1));
      return;
    }
    setSuggesting(true);
    const committed = chipBeforeSpace(typed);
    if (committed) {
      change(committed.before, [...chips, committed.chip]);
      return;
    }
    setText(typed);
    clearTimeout(pause.current);
    pause.current = setTimeout(() => setSearchedText(typed), typingPause);
    if (fieldText === '' && chips.length > 0) {
      showInField('', chips);
    }
  }

  function onSearchButtonPress() {
    setSuggesting(false);
    const committed = committedChip(text);
    change(committed ? committed.before : text, committed ? [...chips, committed.chip] : chips);
  }

  function pick(suggestion: SearchSuggestion) {
    const { before } = splitLastToken(text);
    if (suggestion.chip) {
      change(before, [...chips, suggestion.chip]);
      return;
    }
    setText(before + suggestion.title);
    showInField(before + suggestion.title, chips);
  }

  function removeChip(index: number) {
    change(text, chips.filter((_, chipIndex) => chipIndex !== index));
  }

  const searchBar: SearchBarProps = {
    ref: field,
    placeholder: 'Search your collection',
    autoCapitalize: 'none',
    onChangeText: (event) => onChangeText(event.nativeEvent.text),
    onSearchButtonPress,
    onBlur: () => setSuggesting(false),
    onCancelButtonPress: () => {
      setSuggesting(false);
      change('', []);
    },
  };

  const suggestions = useSearchSuggestions(suggesting ? splitLastToken(text).token : '');
  const { query, chipIndexOfField } = useMemo(() => collectionSearchQuery(searchedText, chips), [searchedText, chips]);

  return {
    searchBar,
    chips,
    removeChip,
    suggestions,
    pick,
    query,
    chipIndexOfField,
    searching: query.text !== undefined || chips.length > 0,
  };
}
