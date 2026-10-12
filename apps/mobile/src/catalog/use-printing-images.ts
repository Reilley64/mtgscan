import { supabase } from '@/lib/supabase';

import { createCatalogLookup } from './catalog-lookup';

export const usePrintingImages = createCatalogLookup(async (printingIds) => {
  const { data } = await supabase.from('card_printings').select('id, image_uris').in('id', printingIds);
  return data && new Map(data.flatMap((row) => (row.image_uris[0] ? [[row.id, row.image_uris[0]]] : [])));
});
