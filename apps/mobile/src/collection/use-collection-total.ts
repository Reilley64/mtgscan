import type { CollectionTotal } from '@mtgscan/supabase/collection';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

export function useCollectionTotal() {
  const [total, setTotal] = useState<CollectionTotal | null>(null);
  const latestRead = useRef(0);

  const reload = useCallback(() => {
    const read = ++latestRead.current;
    supabase.rpc('get_collection_total', { query: {} }).then(({ data, error }) => {
      if (read === latestRead.current && !error) {
        setTotal(data as unknown as CollectionTotal);
      }
    });
  }, []);

  useFocusEffect(reload);

  return total;
}
