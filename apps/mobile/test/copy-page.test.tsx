import { fireEvent, screen, within } from 'expo-router/testing-library';

import { copyOf, delver, openCollection, openCopyPage } from './copies';
import { answerCollectionSearches, failCopyReads, ownCopies, removeCopyFromTheCollection, startSignedIn } from './fake-supabase';
import {
  appearsBefore,
  blurredImageUris,
  cardImageUri,
  cardSheen,
  pressAlertButton,
  presentedAlert,
  pressTab,
  pushedScreenBackButton,
  selectedTab,
  swipeBackFromThePushedScreen,
  symbolNames,
  symbolTintColor,
  typeInSearchBar,
} from './native-ui';
import { tokenColors } from './token-colors';

const { warning, textPrice } = tokenColors;

beforeEach(() => {
  startSignedIn();
});

describe('the binder tile', () => {
  test('a binder tile is a button that names the card, its printing, its finish and condition, and its price', async () => {
    ownCopies([copyOf('copy-1', { finish: 'foil', condition: 'moderately_played', price: { amount: '1635.37', currency: 'USD', finish: 'foil', stale: false } })]);

    const collection = await openCollection();

    expect(collection.getByRole('button', { name: 'Angelic Curator, MH2 262, foil, moderately played, $1,635.37' })).toBeOnTheScreen();
  });

  test('a binder tile opens the copy page for that copy, pushed over the tab bar', async () => {
    ownCopies([copyOf('copy-1'), delver]);

    await openCopyPage(/^Delver of Secrets/);

    const title = screen.getByRole('header', { name: 'Delver of Secrets // Insectile Aberration' });
    expect(title).toBeOnTheScreen();
    expect(within(selectedTab()).queryByRole('header', { name: 'Delver of Secrets // Insectile Aberration' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Angelic Curator' })).not.toBeOnTheScreen();
  });

  test('a binder tile in search results opens the copy page for that copy', async () => {
    const curator = copyOf('copy-1');
    ownCopies([curator, delver]);
    answerCollectionSearches((query) => (query.text === 'delver' ? [delver] : [curator, delver]));
    const collection = await openCollection();

    await typeInSearchBar('delver');
    await fireEvent.press(collection.getByRole('button', { name: /^Delver of Secrets/ }));

    expect(await screen.findByRole('header', { name: 'Delver of Secrets // Insectile Aberration' })).toBeOnTheScreen();
  });
});

describe('the copy page', () => {
  test('the copy page shows the card large over its blurred art, then its name and type line', async () => {
    ownCopies([copyOf('copy-1')]);

    await openCopyPage(/^Angelic Curator/);

    const hero = screen.getByRole('image', { name: 'Angelic Curator' });
    expect(cardImageUri(hero)).toBe('https://cards.scryfall.io/normal/front/curator.jpg');
    expect(cardSheen(hero)).toBeNull();
    expect(blurredImageUris()).toEqual(['https://cards.scryfall.io/normal/front/curator.jpg']);
    const title = screen.getByRole('header', { name: 'Angelic Curator' });
    expect(appearsBefore(hero, title)).toBe(true);
    expect(appearsBefore(title, screen.getByText('Creature — Angel Spirit'))).toBe(true);
  });

  test.each(['foil', 'etched'] as const)('%s copies keep their sheen on the copy page', async (finish) => {
    ownCopies([copyOf('copy-1', { finish })]);

    await openCopyPage(/^Angelic Curator/);

    expect(cardSheen(screen.getByRole('image', { name: 'Angelic Curator' }))).toMatchObject({ opacity: expect.closeTo(0.3) });
  });

  test('chips show the set code, the collector number, the condition, and the language of a nonfoil copy', async () => {
    ownCopies([copyOf('copy-1', { condition: 'lightly_played', language: 'ja' })]);

    await openCopyPage(/^Angelic Curator/);

    for (const chip of ['MH2', '262', 'LP', 'Japanese']) {
      expect(screen.getByLabelText(chip)).toBeOnTheScreen();
    }
    expect(screen.queryByLabelText('Nonfoil')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Protected')).not.toBeOnTheScreen();
  });

  test('a foil copy has a Foil chip, and a protected copy has a Protected chip with the shield in the warning color', async () => {
    ownCopies([copyOf('copy-1', { finish: 'foil', protected: true })]);

    await openCopyPage(/^Angelic Curator/);

    const protectedChip = screen.getByLabelText('Protected');
    expect(within(protectedChip).getByText('Protected')).toHaveStyle({ color: warning });
    expect(symbolNames(protectedChip)).toEqual(['shield.fill']);
    expect(symbolTintColor(protectedChip)).toBe(warning);
    expect(appearsBefore(protectedChip, screen.getByLabelText('MH2'))).toBe(true);
    expect(screen.getByLabelText('Foil')).toBeOnTheScreen();
    expect(screen.getByLabelText('NM')).toBeOnTheScreen();
  });

  test('Price shows the current price, the day the copy was added, the purchase-day price, and the price credit', async () => {
    ownCopies([copyOf('copy-1')]);

    await openCopyPage(/^Angelic Curator/);

    const heading = screen.getByRole('header', { name: 'Price' });
    const current = screen.getByLabelText('Current price, $0.35');
    expect(within(current).getByText('$0.35')).toHaveStyle({ color: textPrice });
    expect(symbolNames(current)).toEqual([]);
    expect(current).not.toHaveProp('accessibilityHint');
    const added = screen.getByLabelText('Added, 12 October 2026');
    const purchaseDay = screen.getByLabelText('Purchase-day price, $0.21');
    const credit = screen.getByText('Current prices from Scryfall, in USD');
    expect(appearsBefore(heading, current)).toBe(true);
    expect(appearsBefore(current, added)).toBe(true);
    expect(appearsBefore(added, purchaseDay)).toBe(true);
    expect(appearsBefore(purchaseDay, credit)).toBe(true);
  });

  test('a stale current price has the clock, and VoiceOver hears that it may be out of date', async () => {
    ownCopies([copyOf('copy-1', { price: { amount: '0.35', currency: 'USD', finish: 'nonfoil', stale: true } })]);

    await openCopyPage(/^Angelic Curator/);

    const current = screen.getByLabelText('Current price, $0.35');
    expect(symbolNames(current)).toEqual(['clock']);
    expect(current).toHaveProp('accessibilityHint', 'The price may be out of date.');
  });

  test('a copy with no prices shows dashes, and VoiceOver says no price', async () => {
    ownCopies([copyOf('copy-1', { price: null, purchase_day_price: null })]);

    await openCopyPage(/^Angelic Curator/);

    expect(within(screen.getByLabelText('Current price, no price')).getByText('–')).toBeOnTheScreen();
    expect(within(screen.getByLabelText('Purchase-day price, no price')).getByText('–')).toBeOnTheScreen();
  });

  test('Rules shows the Oracle text of each face and Commander legality', async () => {
    ownCopies([delver]);

    await openCopyPage(/^Delver of Secrets/);

    const heading = screen.getByRole('header', { name: 'Rules' });
    const front = screen.getByText('At the beginning of your upkeep, look at the top card of your library.');
    const back = screen.getByText('Flying');
    expect(appearsBefore(heading, screen.getByText('Delver of Secrets'))).toBe(true);
    expect(appearsBefore(screen.getByText('Delver of Secrets'), front)).toBe(true);
    expect(appearsBefore(front, screen.getByText('Insectile Aberration'))).toBe(true);
    expect(appearsBefore(screen.getByText('Insectile Aberration'), back)).toBe(true);
    expect(appearsBefore(back, screen.getByLabelText('Commander, Legal'))).toBe(true);
  });

  test('a card with one face shows its Oracle text without the face name', async () => {
    ownCopies([copyOf('copy-1')]);

    await openCopyPage(/^Angelic Curator/);

    expect(screen.getByText('Flying, protection from artifacts')).toBeOnTheScreen();
    expect(screen.getAllByText('Angelic Curator')).toHaveLength(1);
  });

  test.each([
    ['banned', 'Banned'],
    ['not_legal', 'Not legal'],
  ] as const)('a card that is %s in Commander says so', async (commander_legality, shown) => {
    ownCopies([copyOf('copy-1', { commander_legality })]);

    await openCopyPage(/^Angelic Curator/);

    expect(screen.getByLabelText(`Commander, ${shown}`)).toBeOnTheScreen();
  });

  test('the copy page shows only this copy, with no other copies or printings', async () => {
    ownCopies([
      copyOf('copy-1', { condition: 'moderately_played' }),
      copyOf('copy-2', { condition: 'lightly_played' }),
      copyOf('copy-3', { printing_id: 'printing-curator-promo', set: 'pmh2', collector_number: '262p' }),
    ]);

    await openCopyPage('Angelic Curator, MH2 262, lightly played, $0.35');

    expect(screen.getAllByRole('image', { name: 'Angelic Curator' })).toHaveLength(1);
    expect(screen.getByLabelText('LP')).toBeOnTheScreen();
    expect(screen.queryByLabelText('MP')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('PMH2')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Angelic Curator,/ })).not.toBeOnTheScreen();
  });

  test('the copy page has no on-screen back button and goes back to the binder with the edge swipe', async () => {
    ownCopies([copyOf('copy-1')]);
    await openCopyPage(/^Angelic Curator/);

    expect(pushedScreenBackButton()).toBeNull();
    await swipeBackFromThePushedScreen();

    expect(screen.queryByRole('header', { name: 'Angelic Curator' })).not.toBeOnTheScreen();
    expect(within(selectedTab()).getByRole('button', { name: /^Angelic Curator/ })).toBeOnTheScreen();
  });

  test('a copy that no longer exists says so and goes back to the binder, which no longer shows it', async () => {
    ownCopies([copyOf('copy-1'), delver]);
    const collection = await openCollection();
    removeCopyFromTheCollection('copy-delver');

    await fireEvent.press(collection.getByRole('button', { name: /^Delver of Secrets/ }));
    expect(presentedAlert()).toEqual({ title: 'This card is no longer in your collection.', message: undefined, buttons: ['OK'] });
    await pressAlertButton('OK');

    expect(presentedAlert()).toBeNull();
    expect(screen.queryByRole('header', { name: /^Delver of Secrets/ })).not.toBeOnTheScreen();
    expect(within(selectedTab()).queryByRole('button', { name: /^Delver of Secrets/ })).not.toBeOnTheScreen();
    expect(within(selectedTab()).getByRole('button', { name: /^Angelic Curator/ })).toBeOnTheScreen();
  });

  test('a failed copy read offers Try again, which shows the copy', async () => {
    ownCopies([copyOf('copy-1')]);
    failCopyReads(1);
    const collection = await openCollection();

    await fireEvent.press(collection.getByRole('button', { name: /^Angelic Curator/ }));
    expect(await screen.findByText('Could not load this card')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('header', { name: 'Angelic Curator' })).toBeOnTheScreen();
    expect(screen.queryByText('Could not load this card')).not.toBeOnTheScreen();
  });
});
