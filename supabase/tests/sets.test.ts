import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { setCopyProtected } from '../collection';
import { listSets, type CardSet, type FinishView, type SetList, type SetListQuery } from '../sets';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport, runPriceImport } from './catalog-import-command';
import { seedCopies } from './copy-seeds';
import { call, failed, refused, replyOf } from './database-calls';
import { anonymousClient, asDatabaseOwner, secretKeyClient, signUpNewUser, type TestUser } from './local-stack';
import { addedToDeck, deckNamed, scannedCopies, scannedCopy } from './planned-swap-seeds';
import { committed, scanBatch, stack } from './scan-batches';
import { artCrop } from './scryfall-images';

setDefaultTimeout(60_000);

const permissionDenied = '42501';

const lifecreedDuo = 'ca543405-5e12-48a0-9a77-082ac9bcb2f2';
const brambleguardCaptain = 'e200b8bf-f2f3-4157-8e04-02baf07a963e';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const urbanDaggertooth = '4ab83a39-d90d-403e-b74d-fe99c8b2aacd';
const roilCartographer = '84317f9d-5a24-4f74-9c3e-0a8b5c15bb5f';
const roilCartographerVariant = '7b9b743b-340d-4a15-a71d-d3108adbdc45';
const snowCoveredWastes = '87870792-e429-4eba-8193-cdce5c7b6c55';
const kenrithPromo = '56c1227e-bea7-47cb-bbec-389a3d585af5';
const lavinia = 'd5435866-d48b-496a-ba07-438163b71ae8';
const laviniaPromo = '1f1b47ed-e935-44a4-b654-a32c0bf5dd19';
const lichsRelicPromo = 'f6c83e21-892d-478b-9ee1-4e724cb6ca0b';
const prismaticPiper = 'c78c2713-39e7-4a6e-a132-027099a89665';
const captureOfJingzhou = 'f87d0298-f76b-4ea8-82c4-5861c4539d8b';
const counterspell = '0df55e3f-14de-46ef-b6b1-616618724d9e';
const wastes = 'baf8f4f2-9f25-4cd2-8d78-1041e134aeac';
const smotheringTitheSecretLair = '7839cdc8-0cc9-4a17-9642-fb23f6e0be06';
const giselaSecretLair = 'd1cfc318-9c3e-471f-90eb-dc76454da957';
const smotheringTitheEtched = '2309fb66-3aa0-4ec5-9a8e-5a0caa19c270';
const lightningBolt = 'd573ef03-4730-45aa-93dd-e45ac1dbaf4a';
const schemaThief = '312591ec-436d-40e5-805e-e78e6a63096d';

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
});

function setsPage(user: TestUser, query: SetListQuery) {
  return replyOf(user.client, listSets, query);
}

async function everySet(user: TestUser, finishView: FinishView = 'any') {
  let page = await setsPage(user, { finish_view: finishView, limit: 50 });
  let items = page.items;
  while (page.next_cursor !== null) {
    page = await setsPage(user, { finish_view: finishView, limit: 50, cursor: page.next_cursor });
    items = [...items, ...page.items];
  }
  return items;
}

async function setCodes(user: TestUser, finishView: FinishView = 'any') {
  return (await everySet(user, finishView)).map((row) => row.code);
}

async function setRow(user: TestUser, code: string): Promise<CardSet | undefined> {
  return (await setsPage(user, { text: code, finish_view: 'any', limit: 50 })).items.find((row) => row.code === code);
}

describe('the sets list', () => {
  const blbReleasedAt = '2024-08-02';

  afterEach(async () => {
    await asDatabaseOwner((database) => database`update public.card_sets set released_at = ${blbReleasedAt} where code = 'blb'`);
  });

  test('a set is listed with its code, name, set symbol, release date, and set completion in each finish view', async () => {
    const user = await signUpNewUser();

    expect(await setRow(user, 'blb')).toEqual({
      code: 'blb',
      name: 'Bloomburrow',
      icon_svg_uri: 'https://svgs.scryfall.io/sets/blb.svg?1791777600',
      released_at: '2024-08-02',
      set_art_uri: artCrop(lifecreedDuo, 1783910861),
      completion: { any: { owned: 0, size: 3 }, nonfoil: { owned: 0, size: 3 }, foil: { owned: 0, size: 3 } },
    });
  });

  test('a set with no card printing in the card catalog is not listed', async () => {
    const user = await signUpNewUser();

    const codes = await setCodes(user);

    expect(codes).toContain('blb');
    expect(codes).not.toContain('yeoe');
    expect(codes).not.toContain('t40k');
    expect(codes).not.toContain('adft');
  });

  test('a set released today is listed, and a set released tomorrow or with no release date is not', async () => {
    const user = await signUpNewUser();

    await asDatabaseOwner((database) => database`update public.card_sets set released_at = current_date where code = 'blb'`);
    const releasedToday = await setCodes(user);
    await asDatabaseOwner((database) => database`update public.card_sets set released_at = current_date + 1 where code = 'blb'`);
    const releasedTomorrow = await setCodes(user);
    await asDatabaseOwner((database) => database`update public.card_sets set released_at = null where code = 'blb'`);
    const noReleaseDate = await setCodes(user);

    expect(releasedToday).toContain('blb');
    expect(releasedTomorrow).not.toContain('blb');
    expect(noReleaseDate).not.toContain('blb');
  });

  test('sets are listed newest first, then by name', async () => {
    const user = await signUpNewUser();
    const shown = ['blb', 'fdc', 'fdn', 'fj25', 'frc', 'fra', 'j25', 'pfra'];

    const codes = (await setCodes(user)).filter((code) => shown.includes(code));

    expect(codes).toEqual(['fra', 'frc', 'pfra', 'fdn', 'fdc', 'j25', 'fj25', 'blb']);
  });

  test.each([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot list the sets', async (_, client) => {
    expect(await call(client(), listSets, { finish_view: 'any' })).toMatchObject(failed(permissionDenied));
  });
});

describe('the pages of the sets list', () => {
  test('a page holds 20 sets by default, and its cursor reads the next sets in order', async () => {
    const user = await signUpNewUser();

    const first = await setsPage(user, { finish_view: 'any' });
    const second = await setsPage(user, { finish_view: 'any', cursor: first.next_cursor });
    const firstForty = (await everySet(user)).slice(0, 40).map((row) => row.code);

    expect(first.items).toHaveLength(20);
    expect([...first.items, ...second.items].map((row) => row.code)).toEqual(firstForty);
  });

  test('the pages together hold every set once, and the last page has no cursor', async () => {
    const user = await signUpNewUser();
    const pages: SetList[] = [await setsPage(user, { finish_view: 'any', limit: 50 })];
    while (pages.at(-1)!.next_cursor !== null) {
      pages.push(await setsPage(user, { finish_view: 'any', limit: 50, cursor: pages.at(-1)!.next_cursor }));
    }

    const codes = pages.flatMap((page) => page.items.map((row) => row.code));

    expect(pages.length).toBeGreaterThan(3);
    expect(pages.slice(0, -1).every((page) => page.items.length === 50)).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBeGreaterThan(150);
  });

  test('a page holds at most the limit, from 1 to 50 sets', async () => {
    const user = await signUpNewUser();

    expect((await setsPage(user, { finish_view: 'any', limit: 1 })).items).toHaveLength(1);
    expect((await setsPage(user, { finish_view: 'any', limit: 50 })).items).toHaveLength(50);
    expect(await call(user.client, listSets, { finish_view: 'any', limit: 0 })).toMatchObject(refused('invalid_argument', 'limit'));
    expect(await call(user.client, listSets, { finish_view: 'any', limit: 51 })).toMatchObject(refused('invalid_argument', 'limit'));
  });

  test('a cursor from another search or finish view is refused', async () => {
    const user = await signUpNewUser();
    const { next_cursor } = await setsPage(user, { finish_view: 'any', limit: 1 });

    expect(await call(user.client, listSets, { finish_view: 'foil', cursor: next_cursor })).toMatchObject(refused('invalid_cursor', 'cursor'));
    expect(await call(user.client, listSets, { text: 'b', finish_view: 'any', cursor: next_cursor })).toMatchObject(
      refused('invalid_cursor', 'cursor'),
    );
    expect(await call(user.client, listSets, { finish_view: 'any', cursor: 'not a cursor' })).toMatchObject(refused('invalid_cursor', 'cursor'));
  });

  test.each([
    ['a query that is not an object', ['any'], null],
    ['a query with no finish view', {}, 'finish_view'],
    ['an unknown finish view', { finish_view: 'etched' }, 'finish_view'],
    ['a text that is not a string', { finish_view: 'any', text: 3 }, 'text'],
    ['an empty text', { finish_view: 'any', text: '' }, 'text'],
    ['a limit that is not a whole number', { finish_view: 'any', limit: 2.5 }, 'limit'],
    ['a cursor that is not a string', { finish_view: 'any', cursor: 3 }, 'cursor'],
    ['an unknown field', { finish_view: 'any', code: 'blb' }, 'code'],
  ])('%s is refused as an invalid argument', async (_, query, field) => {
    const user = await signUpNewUser();

    expect(await call(user.client, listSets, query as never)).toMatchObject(refused('invalid_argument', field));
  });
});

describe('searching the sets list', () => {
  test('the search text matches the set name, ignoring case', async () => {
    const user = await signUpNewUser();

    const { items } = await setsPage(user, { text: 'BLOOM', finish_view: 'any' });

    expect(items.map((row) => row.code)).toEqual(['blb', 'blc']);
  });

  test('the search text matches the set code, ignoring case', async () => {
    const user = await signUpNewUser();

    const codes = (await setsPage(user, { text: 'Mh3', finish_view: 'any' })).items.map((row) => row.code);

    expect(codes).toEqual(['mh3']);
  });

  test('the search text matches anywhere in the name, and its results come newest first in pages', async () => {
    const user = await signUpNewUser();

    const first = await setsPage(user, { text: 'foundations', finish_view: 'any', limit: 1 });
    const second = await setsPage(user, { text: 'foundations', finish_view: 'any', limit: 1, cursor: first.next_cursor });
    const all = await setsPage(user, { text: 'foundations', finish_view: 'any', limit: 50 });

    expect([...first.items, ...second.items].map((row) => row.code)).toEqual(all.items.slice(0, 2).map((row) => row.code));
    expect(all.items.length).toBeGreaterThan(1);
    expect(all.items.every((row) => row.name.toLowerCase().includes('foundations'))).toBe(true);
  });

  test('a search that matches no set gives an empty page', async () => {
    const user = await signUpNewUser();

    expect(await setsPage(user, { text: 'xyz%_', finish_view: 'any' })).toEqual({ items: [], next_cursor: null });
  });
});

describe('the finish view in the sets list', () => {
  test('a set whose main set is empty in the finish view is left out, such as Alpha in Foil', async () => {
    const user = await signUpNewUser();

    expect(await setCodes(user, 'any')).toContain('lea');
    expect(await setCodes(user, 'nonfoil')).toContain('lea');
    expect(await setCodes(user, 'foil')).not.toContain('lea');
    expect(await setCodes(user, 'foil')).toContain('blb');
  });

  test('a set of only basic lands is left out in every finish view', async () => {
    const user = await signUpNewUser();

    expect(await setCodes(user, 'any')).not.toContain('khm');
    expect(await setCodes(user, 'nonfoil')).not.toContain('khm');
    expect(await setCodes(user, 'foil')).not.toContain('khm');
  });

  test('a page in Foil is full even when sets are left out', async () => {
    const user = await signUpNewUser();
    const foilSets = await setCodes(user, 'foil');

    const page = await setsPage(user, { finish_view: 'foil', limit: 50 });

    expect(page.items.map((row) => row.code)).toEqual(foilSets.slice(0, 50));
  });
});

describe('the set art', () => {
  test('the set art is the art crop of the card printing with the highest current price in any finish', async () => {
    const user = await signUpNewUser();

    expect((await setRow(user, 'sld'))?.set_art_uri).toBe(artCrop(smotheringTitheSecretLair, 1783907442));
    expect((await setRow(user, 'cmm'))?.set_art_uri).toBe(artCrop(smotheringTitheEtched, 1783915569));
    expect((await setRow(user, 'lea'))?.set_art_uri).toBe(artCrop(lightningBolt, 1783948684));
  });

  test('a card printing with no art crop is passed over', async () => {
    const user = await signUpNewUser();
    const [{ art_crop_uri }] = await asDatabaseOwner(
      (database) => database`select art_crop_uri from public.card_printings where id = ${smotheringTitheSecretLair}`,
    );

    await asDatabaseOwner((database) => database`update public.card_printings set art_crop_uri = null where id = ${smotheringTitheSecretLair}`);
    try {
      expect((await setRow(user, 'sld'))?.set_art_uri).toBe(artCrop(giselaSecretLair, 1783915200));
    } finally {
      await asDatabaseOwner(
        (database) => database`update public.card_printings set art_crop_uri = ${art_crop_uri} where id = ${smotheringTitheSecretLair}`,
      );
    }
  });

  test('a tie in price goes to the lower collector number', async () => {
    const user = await signUpNewUser();
    const [{ usd_foil_cents }] = await asDatabaseOwner(
      (database) => database`select usd_foil_cents from public.card_prices where printing_id = ${brambleguardCaptain}`,
    );

    expect((await setRow(user, 'moc'))?.set_art_uri).toBe(artCrop(schemaThief, 1783917234));
    await asDatabaseOwner((database) => database`update public.card_prices set usd_foil_cents = 39 where printing_id = ${brambleguardCaptain}`);
    try {
      expect((await setRow(user, 'blb'))?.set_art_uri).toBe(artCrop(lifecreedDuo, 1783910861));
    } finally {
      await asDatabaseOwner(
        (database) => database`update public.card_prices set usd_foil_cents = ${usd_foil_cents} where printing_id = ${brambleguardCaptain}`,
      );
    }
  });

  test('with no priced card printing, the set art is the art crop of the first card printing by collector number', async () => {
    const user = await signUpNewUser();

    expect((await setRow(user, 'pfra'))?.set_art_uri).toBe(artCrop(lichsRelicPromo, 1791170088));
  });

  test('a basic land card printing never gives the set art, even at the highest price', async () => {
    const user = await signUpNewUser();

    const [{ usd_nonfoil_cents }] = await asDatabaseOwner(
      (database) => database`select usd_nonfoil_cents from public.card_prices where printing_id = ${snowCoveredWastes}`,
    );

    await asDatabaseOwner(
      (database) => database`update public.card_prices set usd_nonfoil_cents = 100000 where printing_id = ${snowCoveredWastes}`,
    );
    try {
      expect((await setRow(user, 'mh3'))?.set_art_uri).toBe(artCrop(roilCartographerVariant, 1783911138));
    } finally {
      await asDatabaseOwner(
        (database) => database`update public.card_prices set usd_nonfoil_cents = ${usd_nonfoil_cents} where printing_id = ${snowCoveredWastes}`,
      );
    }
  });

  test('with no art crop in the set, the set art is null', async () => {
    const user = await signUpNewUser();
    const artCrops = await asDatabaseOwner(
      (database) => database`select id, art_crop_uri from public.card_printings where set_code = 'moc'`,
    );

    await asDatabaseOwner((database) => database`update public.card_printings set art_crop_uri = null where set_code = 'moc'`);
    try {
      expect((await setRow(user, 'moc'))?.set_art_uri).toBeNull();
    } finally {
      await asDatabaseOwner(async (database) => {
        for (const { id, art_crop_uri } of artCrops) {
          await database`update public.card_printings set art_crop_uri = ${art_crop_uri} where id = ${id}`;
        }
      });
    }
  });
});

describe('the main set in set completion', () => {
  test('in a set with booster cards, the main set is its booster card printings that are not promos or variations', async () => {
    const user = await signUpNewUser();
    await committed(
      user,
      scanBatch([stack(roilCartographer), stack(roilCartographerVariant, { finish: 'foil' }), stack(kenrithPromo)]),
    );

    expect((await setRow(user, 'mh3'))?.completion.any).toEqual({ owned: 1, size: 2 });
    expect((await setRow(user, 'eld'))?.completion.any).toEqual({ owned: 0, size: 3 });
  });

  test.each([
    ['a promo', 'promo'],
    ['a variation', 'variation'],
  ])('a booster card printing that is %s is a variant, not in the main set', async (_, flag) => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(lifecreedDuo)]));

    await asDatabaseOwner((database) => database`update public.card_printings set ${database({ [flag]: true })} where id = ${lifecreedDuo}`);
    try {
      expect((await setRow(user, 'blb'))?.completion.any).toEqual({ owned: 0, size: 2 });
    } finally {
      await asDatabaseOwner((database) => database`update public.card_printings set ${database({ [flag]: false })} where id = ${lifecreedDuo}`);
    }
  });

  test('in a set with no booster cards, the main set is every card printing that is not a promo', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(lavinia), stack(laviniaPromo, { finish: 'foil' })]));

    expect((await setRow(user, 'clu'))?.completion.any).toEqual({ owned: 1, size: 2 });
    expect((await setRow(user, 'tdc'))?.completion.any).toEqual({ owned: 0, size: 3 });
  });

  test('in a set made only of promos, the main set is every card printing', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(lichsRelicPromo)]));

    expect((await setRow(user, 'pfra'))?.completion.any).toEqual({ owned: 1, size: 2 });
  });

  test('basic lands are never in the main set, even when they come in boosters', async () => {
    const user = await signUpNewUser();
    await seedCopies(user, [{ card_printing_id: snowCoveredWastes }, { card_printing_id: wastes }]);

    expect((await setRow(user, 'mh3'))?.completion.any).toEqual({ owned: 0, size: 2 });
    expect((await setRow(user, 'eoc'))?.completion.any).toEqual({ owned: 0, size: 1 });
    expect(await setRow(user, 'khm')).toBeUndefined();
  });
});

describe('the copies in set completion', () => {
  test('every copy counts, whatever its finish, condition, language, or protected flag', async () => {
    const user = await signUpNewUser();
    await committed(
      user,
      scanBatch([stack(angelicCurator, { finish: 'etched', condition: 'damaged', language: 'ja' })]),
    );
    const [protectedCopy] = await scannedCopies(user, urbanDaggertooth);
    await replyOf(user.client, setCopyProtected, { copy_id: protectedCopy!, protected: true });

    expect((await setRow(user, 'mh2'))?.completion.any).toEqual({ owned: 2, size: 2 });
  });

  test('a copy in a deck counts', async () => {
    const user = await signUpNewUser();
    const deckId = await deckNamed(user, 'Ygra');
    await addedToDeck(user, deckId, await scannedCopy(user, lifecreedDuo));

    expect((await setRow(user, 'blb'))?.completion.any).toEqual({ owned: 1, size: 3 });
  });

  test('several copies of one card printing count once', async () => {
    const user = await signUpNewUser();
    await committed(
      user,
      scanBatch([stack(lifecreedDuo, { copies: 3 }), stack(lifecreedDuo, { finish: 'foil', condition: 'lightly_played' })]),
    );

    expect((await setRow(user, 'blb'))?.completion.any).toEqual({ owned: 1, size: 3 });
  });

  test("one user never sees another user's copies", async () => {
    const owner = await signUpNewUser();
    const other = await signUpNewUser();
    await committed(owner, scanBatch([stack(lifecreedDuo), stack(brambleguardCaptain)]));

    expect((await setRow(owner, 'blb'))?.completion.any).toEqual({ owned: 2, size: 3 });
    expect((await setRow(other, 'blb'))?.completion.any).toEqual({ owned: 0, size: 3 });
  });
});

describe('set completion in each finish view', () => {
  test('Nonfoil counts the nonfoil copies, and Foil counts the foil and etched copies', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(lifecreedDuo, { finish: 'foil' }), stack(brambleguardCaptain), stack(angelicCurator, { finish: 'etched' })]));

    expect((await setRow(user, 'blb'))?.completion).toEqual({
      any: { owned: 2, size: 3 },
      nonfoil: { owned: 1, size: 3 },
      foil: { owned: 1, size: 3 },
    });
    expect((await setRow(user, 'mh2'))?.completion).toEqual({
      any: { owned: 1, size: 2 },
      nonfoil: { owned: 0, size: 2 },
      foil: { owned: 1, size: 2 },
    });
  });

  test('a card printing with no foil or etched finish leaves the Foil size', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(prismaticPiper), stack(captureOfJingzhou, { finish: 'foil' })]));

    expect((await setRow(user, 'cmm'))?.completion).toEqual({
      any: { owned: 2, size: 3 },
      nonfoil: { owned: 1, size: 3 },
      foil: { owned: 1, size: 2 },
    });
  });

  test('a set with no foil card printing has an empty main set in Foil', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(counterspell)]));

    expect((await setRow(user, 'lea'))?.completion).toEqual({
      any: { owned: 1, size: 5 },
      nonfoil: { owned: 1, size: 5 },
      foil: { owned: 0, size: 0 },
    });
  });
});
