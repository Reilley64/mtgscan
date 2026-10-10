import type { Json } from '../database.types';
import type { Embedder } from '../import/card-embeddings';
import type { ImportClient } from '../import/import-run';
import { readSearchError, type CatalogQuery, type CatalogRow, type SearchPage } from '../search';
import { readCardFacts, readTagClosures, violatedChips, type ChipField } from './chip-check';
import { searchClasses, type CorpusSearch, type SearchClass } from './search-corpus';

export type SearchMode = {
  name: string;
  search: (query: CatalogQuery) => Promise<SearchPage<CatalogRow>>;
  textEmbeddingMs?: number[];
};


type SearchScore = {
  search: string;
  class: SearchClass;
  relevant: number;
  found: number;
  cappedRecall: number;
  uncappedRecall: number;
};

type ClassScore = {
  class: SearchClass;
  searches: number;
  cappedRecall: number | null;
  uncappedRecall: number | null;
};

type ExactNameMiss = { search: string; firstResult: string | null };

type PooledCard = { search: string; oracle_id: string; card: string };

type ChipViolation = PooledCard & { fields: ChipField[] };

type UngradedCard = PooledCard & { grade: null };

export type ModeReport = {
  mode: string;
  exactNames: { rankedFirst: number; searches: number; misses: ExactNameMiss[] };
  classes: ClassScore[];
  searches: SearchScore[];
  chipViolations: ChipViolation[];
  vectorTrigger: boolean;
  p95LatencyMs: number;
  p95TextEmbeddingMs: number | null;
  ungraded: UngradedCard[];
  passed: boolean;
};

export type VectorGate = {
  classFiveRise: number;
  largestDrop: { class: SearchClass; drop: number };
  chipViolations: number;
  p95LatencyMs: number;
  databaseBytes: number;
  passed: boolean;
};

export type ReleaseCheckReport = {
  modes: ModeReport[];
  rulesDataAsOf: string | null;
  databaseBytes: number;
  vectorGate: VectorGate | null;
  ungraded: UngradedCard[];
  passed: boolean;
};

const recallDepth = 20;
export const recallGate = 0.7;
export const vectorTriggerRecall = 0.5;
export const gatedClasses: SearchClass[] = [2, 3, 4];
export const vectorGateTargets = { classFiveRise: 0.15, largestDrop: 0.02, p95LatencyMs: 300, databaseBytes: 400 * 1024 * 1024 };

type SearchRun = { search: CorpusSearch; page: SearchPage<CatalogRow> };

async function searchCatalog(
  client: ImportClient,
  query: CatalogQuery,
  textEmbedding?: number[],
): Promise<SearchPage<CatalogRow>> {
  const { data, error } = await client.rpc('search_catalog', { query: query as Json, text_embedding: textEmbedding });
  if (error) {
    const { code, message, field } = readSearchError(error);
    throw new Error(`Catalog search refused ${JSON.stringify(query)}: ${code} ${message} ${field ?? ''}`.trim());
  }
  return data as unknown as SearchPage<CatalogRow>;
}

export function catalogSearch(client: ImportClient): SearchMode {
  return { name: 'baseline', search: (query) => searchCatalog(client, query) };
}

export function vectorSearch(client: ImportClient, embedText: Embedder): SearchMode {
  const textEmbeddingMs: number[] = [];
  return {
    name: 'vector',
    textEmbeddingMs,
    search: async (query) => {
      if (query.text === undefined) {
        return searchCatalog(client, query);
      }
      const startedAt = performance.now();
      const textEmbedding = await embedText(query.text);
      textEmbeddingMs.push(performance.now() - startedAt);
      return searchCatalog(client, query, textEmbedding);
    },
  };
}

export function edgeFunctionTextEmbedder(client: ImportClient): Embedder {
  return async (text) => {
    const { data, error } = await client.functions.invoke<{ embedding: number[] }>('embed-search-text', {
      body: { text },
    });
    if (error || !data) {
      throw new Error(`The embed-search-text Edge Function refused ${JSON.stringify(text)}: ${error?.message ?? 'no embedding'}`);
    }
    return data.embedding;
  };
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreSearch({ search, page }: SearchRun): SearchScore | null {
  const relevant = [...search.grades].filter(([, grade]) => grade > 0).map(([oracleId]) => oracleId);
  if (relevant.length === 0) {
    return null;
  }
  const top = new Set(page.items.slice(0, recallDepth).map((row) => row.oracle_id));
  const found = relevant.filter((oracleId) => top.has(oracleId)).length;
  return {
    search: search.id,
    class: search.class,
    relevant: relevant.length,
    found,
    cappedRecall: found / Math.min(recallDepth, relevant.length),
    uncappedRecall: found / relevant.length,
  };
}

export function classScore(classes: ClassScore[], searchClass: SearchClass): ClassScore {
  return classes.find((score) => score.class === searchClass)!;
}

function scoreClasses(scores: SearchScore[]): ClassScore[] {
  return searchClasses.map((searchClass) => {
    const inClass = scores.filter((score) => score.class === searchClass);
    return {
      class: searchClass,
      searches: inClass.length,
      cappedRecall: mean(inClass.map((score) => score.cappedRecall)),
      uncappedRecall: mean(inClass.map((score) => score.uncappedRecall)),
    };
  });
}

function exactNames(runs: SearchRun[]): ModeReport['exactNames'] {
  const classOne = runs.filter(({ search }) => search.class === 1);
  const misses = classOne
    .filter(({ search, page }) => search.grades.get(page.items[0]?.oracle_id ?? '') !== 2)
    .map(({ search, page }) => ({ search: search.id, firstResult: page.items[0]?.name ?? null }));
  return { rankedFirst: classOne.length - misses.length, searches: classOne.length, misses };
}

function ungradedCards(runs: SearchRun[]): UngradedCard[] {
  return runs.flatMap(({ search, page }) =>
    page.items
      .slice(0, recallDepth)
      .filter((row) => !search.grades.has(row.oracle_id))
      .map((row) => ({ search: search.id, oracle_id: row.oracle_id, card: row.name, grade: null })),
  );
}

async function chipViolations(client: ImportClient, runs: SearchRun[]): Promise<ChipViolation[]> {
  const closures = await readTagClosures(
    client,
    runs.flatMap(({ search }) => [...(search.query.tags ?? []), ...(search.query.tags_exclude ?? [])]),
  );
  const violations: ChipViolation[] = [];
  for (const { search, page } of runs) {
    if (page.items.length === 0) {
      continue;
    }
    const facts = await readCardFacts(
      client,
      page.items.map((row) => row.oracle_id),
    );
    for (const row of page.items) {
      const card = facts.get(row.oracle_id);
      if (!card) {
        throw new Error(`${row.name} from ${search.id} is not in the card catalog.`);
      }
      const fields = violatedChips(search.query, card, closures);
      if (fields.length > 0) {
        violations.push({ search: search.id, oracle_id: row.oracle_id, card: row.name, fields });
      }
    }
  }
  return violations;
}

function percentile95(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

async function serverLatencies(client: ImportClient, searchIds: string[]): Promise<number[]> {
  const { data, error } = await client
    .from('search_telemetry')
    .select('search_id, latency_ms')
    .eq('caller', 'release_check')
    .in('search_id', searchIds);
  if (error) {
    throw new Error(`Could not read search telemetry: ${error.message}`);
  }
  if (data.length !== new Set(searchIds).size) {
    throw new Error(`Search telemetry has ${data.length} release check rows for ${searchIds.length} searches.`);
  }
  return data.map((row) => row.latency_ms);
}

async function databaseBytes(client: ImportClient): Promise<number> {
  const { data, error } = await client.rpc('catalog_storage_sizes');
  const database = data?.find((row) => row.relation === 'database');
  if (error || !database) {
    throw new Error(`Could not read the database size: ${error?.message ?? 'no database row'}`);
  }
  return database.total_bytes;
}

async function checkMode(client: ImportClient, corpus: CorpusSearch[], mode: SearchMode): Promise<{ report: ModeReport; rulesDataAsOf: string | null }> {
  const runs: SearchRun[] = [];
  for (const search of corpus) {
    runs.push({ search, page: await mode.search({ ...search.query, limit: recallDepth }) });
  }
  const scores = runs.map(scoreSearch).filter((score) => score !== null);
  const classes = scoreClasses(scores);
  const exactNameResult = exactNames(runs);
  const violations = await chipViolations(client, runs);
  const classFive = classScore(classes, 5).cappedRecall;
  const passed =
    exactNameResult.searches > 0 &&
    exactNameResult.misses.length === 0 &&
    violations.length === 0 &&
    gatedClasses.every((searchClass) => (classScore(classes, searchClass).cappedRecall ?? 0) >= recallGate);
  return {
    rulesDataAsOf: runs[0]?.page.rules_data_as_of ?? null,
    report: {
      mode: mode.name,
      exactNames: exactNameResult,
      classes,
      searches: scores,
      chipViolations: violations,
      vectorTrigger: classFive !== null && classFive < vectorTriggerRecall,
      p95LatencyMs: percentile95(await serverLatencies(client, runs.map(({ page }) => page.search_id))),
      p95TextEmbeddingMs: mode.textEmbeddingMs?.length ? percentile95(mode.textEmbeddingMs) : null,
      ungraded: ungradedCards(runs),
      passed,
    },
  };
}

function vectorGate(modes: ModeReport[], bytes: number): VectorGate | null {
  const baseline = modes.find((mode) => mode.mode === 'baseline');
  const vector = modes.find((mode) => mode.mode === 'vector');
  if (!baseline || !vector) {
    return null;
  }
  const recallOf = (mode: ModeReport, searchClass: SearchClass) => classScore(mode.classes, searchClass).cappedRecall ?? 0;
  const classFiveRise = recallOf(vector, 5) - recallOf(baseline, 5);
  const largestDrop = searchClasses
    .filter((searchClass) => searchClass !== 5)
    .map((searchClass) => ({ class: searchClass, drop: recallOf(baseline, searchClass) - recallOf(vector, searchClass) }))
    .reduce((largest, next) => (next.drop > largest.drop ? next : largest));
  return {
    classFiveRise,
    largestDrop,
    chipViolations: vector.chipViolations.length,
    p95LatencyMs: vector.p95LatencyMs,
    databaseBytes: bytes,
    passed:
      classFiveRise >= vectorGateTargets.classFiveRise &&
      largestDrop.drop <= vectorGateTargets.largestDrop &&
      vector.chipViolations.length === 0 &&
      vector.p95LatencyMs <= vectorGateTargets.p95LatencyMs &&
      bytes < vectorGateTargets.databaseBytes,
  };
}

export async function runReleaseCheck(
  client: ImportClient,
  corpus: CorpusSearch[],
  modes: SearchMode[] = [catalogSearch(client)],
): Promise<ReleaseCheckReport> {
  const modeChecks = [];
  for (const mode of modes) {
    modeChecks.push(await checkMode(client, corpus, mode));
  }
  const ungraded = new Map(
    modeChecks.flatMap(({ report }) => report.ungraded).map((card) => [`${card.search} ${card.oracle_id}`, card]),
  );
  const modeReports = modeChecks.map(({ report }) => report);
  const bytes = await databaseBytes(client);
  return {
    modes: modeReports,
    rulesDataAsOf: modeChecks[0]?.rulesDataAsOf ?? null,
    databaseBytes: bytes,
    vectorGate: vectorGate(modeReports, bytes),
    ungraded: [...ungraded.values()],
    passed: modeChecks.every(({ report }) => report.passed),
  };
}
