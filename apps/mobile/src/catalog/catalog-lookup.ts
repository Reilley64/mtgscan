import { useEffect, useState } from 'react';

const readChunk = 100;

type ReadValues = (keys: string[]) => Promise<Map<string, string> | null>;

export function createCatalogLookup(readValues: ReadValues) {
  const valueByKey = new Map<string, string | null>();
  const reading = new Set<string>();
  const listeners = new Set<() => void>();

  async function readChunks(keys: string[]) {
    for (let start = 0; start < keys.length; start += readChunk) {
      const chunk = keys.slice(start, start + readChunk);
      const found = await readValues(chunk);
      if (found) {
        chunk.forEach((key) => valueByKey.set(key, found.get(key) ?? null));
      }
    }
  }

  function readMissing(keys: string[]) {
    const missing = [...new Set(keys)].filter((key) => !valueByKey.has(key) && !reading.has(key));
    if (missing.length === 0) {
      return;
    }
    missing.forEach((key) => reading.add(key));
    void readChunks(missing)
      .catch(() => {})
      .finally(() => {
        missing.forEach((key) => reading.delete(key));
        listeners.forEach((listener) => listener());
      });
  }

  return function useCatalogLookup(keys: readonly string[]): (key: string) => string | undefined {
    const [, setReads] = useState(0);
    const joined = keys.join(',');

    useEffect(() => {
      const listener = () => setReads((reads) => reads + 1);
      listeners.add(listener);
      readMissing(joined ? joined.split(',') : []);
      return () => {
        listeners.delete(listener);
      };
    }, [joined]);

    return (key) => valueByKey.get(key) ?? undefined;
  };
}
