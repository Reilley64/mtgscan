import { supabase } from '@/lib/supabase';

import { createCatalogLookup } from './catalog-lookup';

export const useSetIcons = createCatalogLookup(async (setCodes) => {
  const { data } = await supabase.from('card_sets').select('code, icon_svg_uri').in('code', setCodes);
  return data && new Map(data.map((row) => [row.code, row.icon_svg_uri]));
});
