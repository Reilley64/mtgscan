import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  catalogFixtureManifest,
  resetCardCatalog,
  runCatalogImport,
  setsFixture,
} from './catalog-import-command';
import { anonymousClient, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';

type SetsFile = { data: { code: string; name: string; icon_svg_uri?: string }[] };

let alice: TestUser;

async function setsFile(change: (file: SetsFile) => SetsFile): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mtgscan-sets-fixture-'));
  const path = join(directory, 'sets.json');
  await Bun.write(path, JSON.stringify(change(await Bun.file(setsFixture).json())));
  return path;
}

async function cardSet(code: string) {
  const { data, error } = await alice.client.from('card_sets').select('code, name, icon_svg_uri').eq('code', code);
  expect(error).toBeNull();
  return data![0];
}

beforeAll(async () => {
  alice = await signUpNewUser();
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

describe('the catalog import', () => {
  test('adds every set with its name and its Scryfall icon', async () => {
    const { count } = await alice.client.from('card_sets').select('*', { count: 'exact', head: true });

    expect(count).toBe(176);
    expect(await cardSet('mul')).toEqual({
      code: 'mul',
      name: 'Multiverse Legends',
      icon_svg_uri: 'https://svgs.scryfall.io/sets/mul.svg?1791777600',
    });
  });

  test("keeps the parent set's icon that Scryfall gives a set", async () => {
    expect((await cardSet('plst'))?.icon_svg_uri).toBe('https://svgs.scryfall.io/sets/planeswalker.svg?1791777600');
  });

  test('updates a set whose icon changed, even when the card files did not change', async () => {
    const changed = await setsFile((file) => ({
      data: file.data.map((set) =>
        set.code === 'mul' ? { ...set, icon_svg_uri: 'https://svgs.scryfall.io/sets/mul.svg?1800000000' } : set,
      ),
    }));

    const result = await runCatalogImport(catalogFixtureManifest, '--sets', changed);

    expect(result.exitCode).toBe(0);
    expect((await cardSet('mul'))?.icon_svg_uri).toBe('https://svgs.scryfall.io/sets/mul.svg?1800000000');
  });

  test('fails and changes no set when a set has no icon', async () => {
    const before = await cardSet('ss1');
    const broken = await setsFile((file) => ({
      data: file.data.map((set) =>
        set.code === 'mul' ? { code: set.code, name: set.name } : { ...set, name: `${set.name} changed` },
      ),
    }));

    const result = await runCatalogImport(catalogFixtureManifest, '--sets', broken);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Every set needs a code, a name, and an icon_svg_uri.');
    expect(await cardSet('ss1')).toEqual(before);
  });
});

describe('card set access', () => {
  test('an anonymous caller reads no card sets', async () => {
    const { data } = await anonymousClient().from('card_sets').select('code').limit(1);

    expect(data ?? []).toEqual([]);
  });

  test.each([
    ['a signed-in user', () => alice.client],
    ['an anonymous caller', () => anonymousClient()],
  ])('%s cannot write card sets', async (_caller, client) => {
    const writes = [
      client().from('card_sets').insert({ code: 'new', name: 'New', icon_svg_uri: 'https://example.com/new.svg' }),
      client().from('card_sets').update({ name: 'Changed' }).eq('code', 'mul'),
      client().from('card_sets').delete().eq('code', 'mul'),
    ];

    for (const { error } of await Promise.all(writes)) {
      expect(error?.code).toBe(permissionDenied);
    }
  });

  test.each([
    ['a signed-in user', () => alice.client],
    ['an anonymous caller', () => anonymousClient()],
  ])('%s cannot call the set import function', async (_caller, client) => {
    const { error } = await client().rpc('import_card_sets', { sets: [] });

    expect(error?.code).toBe(permissionDenied);
  });
});
