import type { TagLookupPage } from '@mtgscan/supabase/search';
import { useEffect, useMemo, useState } from 'react';

import { chipSuggestion, fixedSuggestions, typedValue, type SearchSuggestion, type TypedValue } from '@/collection/collection-search';
import { supabase } from '@/lib/supabase';

const suggestionLimit = 8;

async function catalogSuggestions(typed: TypedValue): Promise<SearchSuggestion[]> {
  if (typed.key === 'set') {
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
  const { data, error } = await supabase.rpc('search_oracle_tags', { query: { text: typed.value, limit: suggestionLimit } });
  if (error) {
    throw error;
  }
  return (data as unknown as TagLookupPage).items.map((tag) => chipSuggestion(typed, tag.slug, tag.label));
}

function catalogLookup(token: string) {
  const typed = typedValue(token);
  return typed && typed.value && (typed.key === 'set' || typed.key === 'tag') ? typed : null;
}

export function useSearchSuggestions(token: string) {
  const fixed = useMemo(() => fixedSuggestions(token), [token]);
  const [found, setFound] = useState<{ token: string; suggestions: SearchSuggestion[] } | null>(null);

  useEffect(() => {
    const typed = catalogLookup(token);
    if (!typed) {
      return;
    }
    let current = true;
    catalogSuggestions(typed).then(
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
