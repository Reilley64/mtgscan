import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import { useEffect, useMemo, useState } from 'react';

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
import { readUserTags } from '@/collection/user-tags';
import { cardCountLabel } from '@/decks/deck-labels';
import { readDecks } from '@/decks/use-decks';
import { replyOf } from '@/lib/database-reply';
import { supabase } from '@/lib/supabase';
import { useTypingPause } from '@/lib/use-typing-pause';

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
  const result = await callDatabaseFunction(supabase, databaseFunctions.search_oracle_tags, { text: typed.value, limit: suggestionLimit });
  return replyOf(result).items.map((tag) => chipSuggestion(typed, tag.slug, tag.label));
}

async function userTagSuggestions(typed: TypedValue): Promise<SearchSuggestion[]> {
  const { userTags } = await readUserTags();
  return userTagsFound(userTags, typed.value)
    .slice(0, suggestionLimit)
    .map((userTag) => chipSuggestion(typed, userTag.name, shownCopyCount(userTag.copy_count)));
}

async function deckSuggestions(typed: TypedValue): Promise<SearchSuggestion[]> {
  const { decks } = await readDecks();
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
      return typed.value ? setSuggestions(typed) : null;
    case 'tag':
      return typed.value ? oracleTagSuggestions(typed) : null;
    case 'user_tag':
      return userTagSuggestions(typed);
    case 'deck':
      return deckSuggestions(typed);
    default:
      return null;
  }
}

export function useSearchSuggestions(token: string) {
  const fixed = useMemo(() => fixedSuggestions(token), [token]);
  const [pausedToken] = useTypingPause(token);
  const [found, setFound] = useState<{ token: string; suggestions: SearchSuggestion[] } | null>(null);

  useEffect(() => {
    const lookup = suggestionLookup(pausedToken);
    if (!lookup) {
      return;
    }
    let current = true;
    lookup.then(
      (suggestions) => {
        if (current) {
          setFound({ token: pausedToken, suggestions });
        }
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [pausedToken]);

  return found?.token === token ? [...fixed, ...found.suggestions] : fixed;
}
