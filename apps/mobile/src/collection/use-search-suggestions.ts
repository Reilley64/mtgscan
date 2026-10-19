import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import { useMemo } from 'react';

import {
  chipLabel,
  chipSuggestion,
  fixedSuggestions,
  keyValueChip,
  typedValue,
  type SearchSuggestion,
  type TypedValue,
} from '@/collection/collection-search';
import { shownCopyCount } from '@/collection/total-labels';
import { userTagsFound } from '@/collection/user-tag-names';
import { userTagsRead } from '@/collection/user-tags';
import { cardCountLabel } from '@/decks/deck-labels';
import { decksRead } from '@/decks/use-decks';
import { databaseRead, useScreenRead, useTypingPause } from '@/lib/read';
import { supabase } from '@/lib/supabase';

const suggestionLimit = 8;

async function setSuggestions(typed: TypedValue): Promise<SearchSuggestion[]> {
  const { data, error } = await supabase
    .from('card_sets')
    .select('code, name')
    .ilike('code', `${typed.value.replace(/[\\%_]/g, '\\$&')}%`)
    .order('code')
    .limit(suggestionLimit);
  if (error) {
    throw error;
  }
  return data.map((set) => chipSuggestion(typed, set.code, set.name));
}

async function oracleTagSuggestions(typed: TypedValue): Promise<SearchSuggestion[]> {
  const { items } = await databaseRead(databaseFunctions.search_oracle_tags, { text: typed.value, limit: suggestionLimit }).read();
  return items.map((tag) => chipSuggestion(typed, tag.slug, tag.label));
}

async function userTagSuggestions(typed: TypedValue): Promise<SearchSuggestion[]> {
  const { items } = await userTagsRead.read();
  return userTagsFound(items, typed.value)
    .slice(0, suggestionLimit)
    .map((userTag) => chipSuggestion(typed, userTag.name, shownCopyCount(userTag.copy_count)));
}

async function deckSuggestions(typed: TypedValue): Promise<SearchSuggestion[]> {
  const { items: decks } = await decksRead.read();
  const found = typed.value.trim().toLowerCase();
  return decks
    .filter((deck) => deck.name.toLowerCase().includes(found))
    .map((deck) => {
      const chip = { ...keyValueChip(typed.key, deck.name, typed.negated), deckId: deck.deck_id };
      return {
        title: chipLabel(chip),
        detail: cardCountLabel(deck.card_count),
        chip,
        avatar: { uri: deck.commanders[0]?.art_crop_uri ?? null },
      };
    });
}

function suggestionLookup(token: string) {
  const typed = typedValue(token);
  switch (typed?.key) {
    case 'set':
      return typed.value ? () => setSuggestions(typed) : null;
    case 'tag':
      return typed.value ? () => oracleTagSuggestions(typed) : null;
    case 'user_tag':
      return () => userTagSuggestions(typed);
    case 'deck':
      return () => deckSuggestions(typed);
    default:
      return null;
  }
}

function loadedSuggestions(suggestions: SearchSuggestion[]) {
  return { status: 'loaded' as const, suggestions };
}

export function useSearchSuggestions(token: string) {
  const fixed = useMemo(() => fixedSuggestions(token), [token]);
  const [pausedToken] = useTypingPause(token);
  const lookup = suggestionLookup(pausedToken);
  const { read } = useScreenRead(lookup && { key: ['search_suggestions', pausedToken], read: lookup }, loadedSuggestions);
  return read.status === 'loaded' && pausedToken === token ? [...fixed, ...read.suggestions] : fixed;
}
