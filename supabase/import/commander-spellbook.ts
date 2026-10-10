import type { ParsedElementInfo } from '@streamparser/json-whatwg';
import JSONParser from '@streamparser/json-whatwg/jsonparser.js';

import type { ImportAdapter, StagedRow } from './import-run';

export const commanderSpellbookVariantsUrl = 'https://json.commanderspellbook.com/variants.json.gz';

const spellbookHeaders = {
  'User-Agent': 'mtgscan-combo-import/0.0 (+https://github.com/Reilley64/mtgscan)',
};

const bracketTags: Record<string, string> = {
  R: 'ruthless',
  S: 'spicy',
  P: 'powerful',
  O: 'oddball',
  C: 'core',
  E: 'exhibition',
  B: 'banned',
};

type SpellbookVariant = {
  id?: string;
  status?: string;
  uses?: { card?: { oracleId?: string | null }; quantity?: number }[];
  requires?: unknown[];
  produces?: { feature?: { name?: string } }[];
  identity?: string;
  bracketTag?: string;
};

type ParsedValues = ReadableStreamDefaultReader<ParsedElementInfo>;

class SpellbookFileError extends Error {
  constructor(reason: string) {
    super(`Could not read the Commander Spellbook variants file: ${reason}`);
  }
}

function isTwoCardCombo(variant: SpellbookVariant): boolean {
  return (
    variant.status === 'OK' &&
    variant.uses?.length === 2 &&
    variant.uses.every((use) => use.quantity === 1) &&
    variant.requires?.length === 0
  );
}

function colorIdentity(identity: string | undefined): string[] | null {
  if (identity === 'C') {
    return [];
  }
  return identity && /^[WUBRG]+$/.test(identity) ? [...identity].sort() : null;
}

function producedFeatures(variant: SpellbookVariant): string[] | null {
  const names = variant.produces?.map((produced) => produced.feature?.name);
  return names?.every((name) => typeof name === 'string') ? (names as string[]) : null;
}

function comboRow(variant: SpellbookVariant): StagedRow {
  const [first, second] = variant.uses!;
  return {
    target: 'combos',
    row: {
      id: variant.id ?? null,
      first_oracle_id: first?.card?.oracleId ?? null,
      second_oracle_id: second?.card?.oracleId ?? null,
      color_identity: colorIdentity(variant.identity),
      produced_features: producedFeatures(variant),
      bracket_tag: bracketTags[variant.bracketTag ?? ''] ?? null,
    },
  };
}

async function readValue(values: ParsedValues) {
  try {
    return await values.read();
  } catch (error) {
    throw new SpellbookFileError((error as Error).message);
  }
}

async function* comboRows(values: ParsedValues): AsyncGenerator<StagedRow> {
  for (let next = await readValue(values); !next.done; next = await readValue(values)) {
    const variant = next.value.value as SpellbookVariant;
    if (isTwoCardCombo(variant)) {
      yield comboRow(variant);
    }
  }
}

async function openVariantsFile(location: string): Promise<ReadableStream<Uint8Array>> {
  const response = /^https?:\/\//.test(location)
    ? await fetch(location, { headers: spellbookHeaders })
    : new Response(Bun.file(location));
  if (!response.ok || !response.body) {
    throw new Error(`Could not read ${location}: HTTP ${response.status}`);
  }
  return response.body;
}

export async function commanderSpellbook(variantsLocation: string): Promise<ImportAdapter> {
  const values = (await openVariantsFile(variantsLocation))
    .pipeThrough(new JSONParser({ paths: ['$.timestamp', '$.variants.*'], keepStack: false }))
    .getReader();
  const first = await readValue(values);
  const timestamp = first.done || first.value.key !== 'timestamp' ? undefined : first.value.value;
  const sourceUpdatedAt = new Date(typeof timestamp === 'string' ? timestamp : Number.NaN);
  if (Number.isNaN(sourceUpdatedAt.getTime())) {
    throw new SpellbookFileError('it has no timestamp before its variants');
  }
  return {
    source: 'commander_spellbook',
    sourceUpdatedAt,
    rows: () => comboRows(values),
  };
}
