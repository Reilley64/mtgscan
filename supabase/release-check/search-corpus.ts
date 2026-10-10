import { join } from 'node:path';

import type { CatalogQuery } from '../search';

export const searchClasses = [1, 2, 3, 4, 5] as const;

export type SearchClass = (typeof searchClasses)[number];

type Grade = 0 | 1 | 2;

export type CorpusSearch = {
  id: string;
  class: SearchClass;
  intent: string;
  query: CatalogQuery;
  reference_query: string;
  grades: Map<string, Grade>;
};

export const searchCorpusDirectory = import.meta.dir;

const searchFields = ['id', 'class', 'intent', 'query', 'reference_query'];
const gradeFields = ['search', 'oracle_id', 'card', 'grade'];
const slug = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Line = { location: string; record: Record<string, unknown> };

async function readJsonLines(path: string): Promise<Line[]> {
  const text = await Bun.file(path).text();
  return text
    .split('\n')
    .map((line, index) => ({ line, location: `${path}:${index + 1}` }))
    .filter(({ line }) => line.trim() !== '')
    .map(({ line, location }) => {
      const record: unknown = JSON.parse(line);
      if (typeof record !== 'object' || record === null || Array.isArray(record)) {
        throw new Error(`${location}: each line must be a JSON object.`);
      }
      return { location, record: record as Record<string, unknown> };
    });
}

function checkFields({ location, record }: Line, fields: string[]): void {
  const keys = Object.keys(record);
  if (keys.length !== fields.length || !fields.every((field) => keys.includes(field))) {
    throw new Error(`${location}: the fields must be ${fields.join(', ')}.`);
  }
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function readSearch(line: Line): CorpusSearch {
  checkFields(line, searchFields);
  const { id, class: searchClass, intent, query, reference_query } = line.record;
  if (!isText(id) || !slug.test(id)) {
    throw new Error(`${line.location}: id must be a lowercase slug.`);
  }
  if (!searchClasses.includes(searchClass as SearchClass)) {
    throw new Error(`${line.location}: class must be 1, 2, 3, 4, or 5.`);
  }
  if (!isText(intent) || !isText(reference_query)) {
    throw new Error(`${line.location}: intent and reference_query must be text.`);
  }
  if (typeof query !== 'object' || query === null || Array.isArray(query)) {
    throw new Error(`${line.location}: query must be a JSON object.`);
  }
  return {
    id,
    class: searchClass as SearchClass,
    intent,
    query: query as CatalogQuery,
    reference_query,
    grades: new Map(),
  };
}

function addGrade(searches: Map<string, CorpusSearch>, line: Line): void {
  checkFields(line, gradeFields);
  const { search: searchId, oracle_id, card, grade } = line.record;
  const search = searches.get(searchId as string);
  if (!search) {
    throw new Error(`${line.location}: search ${String(searchId)} is not in the corpus.`);
  }
  if (!isText(oracle_id) || !uuid.test(oracle_id) || !isText(card)) {
    throw new Error(`${line.location}: oracle_id must be a UUID and card must be text.`);
  }
  if (grade !== 0 && grade !== 1 && grade !== 2) {
    throw new Error(`${line.location}: grade must be 0, 1, or 2.`);
  }
  if (search.grades.has(oracle_id)) {
    throw new Error(`${line.location}: ${card} already has a grade for ${search.id}.`);
  }
  search.grades.set(oracle_id, grade);
}

export async function readSearchCorpus(directory = searchCorpusDirectory): Promise<CorpusSearch[]> {
  const searches = new Map<string, CorpusSearch>();
  for (const line of await readJsonLines(join(directory, 'search-corpus.jsonl'))) {
    const search = readSearch(line);
    if (searches.has(search.id)) {
      throw new Error(`${line.location}: id ${search.id} is already in the corpus.`);
    }
    searches.set(search.id, search);
  }
  for (const line of await readJsonLines(join(directory, 'search-grades.jsonl'))) {
    addGrade(searches, line);
  }
  return [...searches.values()];
}
