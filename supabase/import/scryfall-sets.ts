import { ImportFailed, type ImportClient } from './import-run';
import { scryfallHeaders } from './scryfall-bulk-data';
import { openLocation } from './source-file';

export const scryfallSetsUrl = 'https://api.scryfall.com/sets';

type ScryfallSet = {
  code?: string;
  name?: string;
  set_type?: string;
  released_at?: string;
  icon_svg_uri?: string;
};

export async function importCardSets(client: ImportClient, location: string): Promise<void> {
  const list = (await (await openLocation(location, scryfallHeaders)).json()) as { data?: ScryfallSet[] };
  const sets = (list.data ?? []).map(({ code, name, set_type, released_at, icon_svg_uri }) => ({
    code: code ?? null,
    name: name ?? null,
    set_type: set_type ?? null,
    released_at: released_at ?? null,
    icon_svg_uri: icon_svg_uri ?? null,
  }));
  const { data, error } = await client.rpc('import_card_sets', { sets });
  if (error) {
    throw new ImportFailed(`Card sets: ${error.message}`);
  }
  console.log(`Card sets: ${sets.length} read, ${data} new or changed.`);
}
