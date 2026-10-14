import type { TagLookupPage } from '@mtgscan/supabase/search';
import { useEffect, useMemo, useState } from 'react';

import { chipSuggestion, fixedSuggestions, typedValue, type SearchSuggestion, type TypedValue } from '@/collection/collection-search';
import { shownCopyCount } from '@/collection/total-labels';
import { userTagsFound } from '@/collection/user-tag-names';
import { readUserTags } from '@/collection/user-tags';
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
  const { data, error } = await supabase.rpc('search_oracle_tags', { query: { text: typed.value, limit: suggestionLimit } });
  if (error) {
    throw error;
  }
  return (data as unknown as TagLookupPage).items.map((tag) => chipSuggestion(typed, tag.slug, tag.label));
}

async function userTagSuggestions(typed: TypedValue): Promise<SearchSuggestion[]> {
  const read = await readUserTags();
  if (read.status === 'failed') {
    return [];
  }
  return userTagsFound(read.userTags, typed.value)
    .slice(0, suggestionLimit)
    .map((userTag) => chipSuggestion(typed, userTag.name, shownCopyCount(userTag.copy_count)));
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
    default:
      return null;
  }
}

export function useSearchSuggestions(token: string) {
  const fixed = useMemo(() => fixedSuggestions(token), [token]);
  const [found, setFound] = useState<{ token: string; suggestions: SearchSuggestion[] } | null>(null);

  useEffect(() => {
    const lookup = suggestionLookup(token);
    if (!lookup) {
      return;
    }
    let current = true;
    lookup.then(
      (suggestions) => {
        if (current) {
          setFound({ token, suggestions });
        }
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [token]);

  return found?.token === token ? [...fixed, ...found.suggestions] : fixed;
}
