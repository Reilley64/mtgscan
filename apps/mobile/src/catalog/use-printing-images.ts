import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

const readChunk = 100;
const imageByPrintingId = new Map<string, string | null>();
const reading = new Set<string>();
const listeners = new Set<() => void>();

async function readImages(printingIds: string[]) {
  for (let start = 0; start < printingIds.length; start += readChunk) {
    const chunk = printingIds.slice(start, start + readChunk);
    const { data } = await supabase.from('card_printings').select('id, image_uris').in('id', chunk);
    if (data) {
      const found = new Map(data.map((row) => [row.id, row.image_uris[0] ?? null]));
      chunk.forEach((id) => imageByPrintingId.set(id, found.get(id) ?? null));
    }
  }
}

function readMissingImages(printingIds: string[]) {
  const missing = printingIds.filter((id) => !imageByPrintingId.has(id) && !reading.has(id));
  if (missing.length === 0) {
    return;
  }
  missing.forEach((id) => reading.add(id));
  void readImages(missing)
    .catch(() => {})
    .finally(() => {
      missing.forEach((id) => reading.delete(id));
      listeners.forEach((listener) => listener());
    });
}

export function usePrintingImages(printingIds: readonly string[]): (printingId: string) => string | undefined {
  const [, setReads] = useState(0);
  const key = printingIds.join(',');

  useEffect(() => {
    const listener = () => setReads((reads) => reads + 1);
    listeners.add(listener);
    readMissingImages(key ? key.split(',') : []);
    return () => {
      listeners.delete(listener);
    };
  }, [key]);

  return (printingId) => imageByPrintingId.get(printingId) ?? undefined;
}
