import { fireEvent } from 'expo-router/testing-library';

import { deckCardOf, openDeckNamed, openDeckWithCards } from './copies';
import { ownDecks, startSignedIn } from './fake-supabase';
import {
  buttonMenu,
  menuButton,
  menuButtonNames,
  pressButtonMenuItem,
  pressHeaderButton,
  pressTab,
  pushedScreen,
  symbolNames,
  symbolTintColor,
} from './native-ui';
import { renderApp, restartTheApp } from './render-app';
import { tokenColors } from './token-colors';

const { primary, text } = tokenColors;

beforeEach(() => {
  startSignedIn();
});

const commander = deckCardOf('commander', "Atraxa, Praetors' Voice", 'Legendary Creature — Phyrexian Angel Horror', {
  role: 'commander',
  commander_at: '2026-10-15T09:00:00.000Z',
  mana_value: 4,
  colors: ['W', 'U', 'B', 'G'],
  rarity: 'mythic',
});

function groupHeaders(deck: Awaited<ReturnType<typeof openDeckNamed>>) {
  return deck
    .getAllByRole('header')
    .map((header) => header.props.accessibilityLabel ?? header.props.children)
    .slice(1);
}

function tileNames(deck: Awaited<ReturnType<typeof openDeckNamed>>) {
  return deck.getAllByRole('button', { name: /MH2 262/ }).map((tile) => tile.props.accessibilityLabel.split(', MH2')[0]);
}

function deckMenuButton(name: string) {
  return menuButton(pushedScreen(), name);
}

describe('the group button', () => {
  test('opens a native menu titled "Group by" with Type checked, and VoiceOver reads "Group, Type"', async () => {
    await openDeckWithCards([deckCardOf('sol-ring', 'Sol Ring', 'Artifact')]);

    expect(menuButtonNames(pushedScreen())).toEqual(['Group, Type', 'Sort, Name, A to Z']);
    expect(buttonMenu(deckMenuButton('Group, Type'))).toEqual({
      title: 'Group by',
      items: [
        { title: 'Type', checked: true, symbol: undefined },
        { title: 'Mana value', checked: false, symbol: undefined },
        { title: 'Color', checked: false, symbol: undefined },
        { title: 'Rarity', checked: false, symbol: undefined },
        { title: 'None', checked: false, symbol: undefined },
      ],
    });
  });

  test('groups by mana value from 0 to 7+, then the cards of the Type group Lands, with the commanders first and empty groups hidden', async () => {
    const deck = await openDeckWithCards([
      commander,
      deckCardOf('tower', 'Command Tower', 'Land', { mana_value: 0 }),
      deckCardOf('dryad', 'Dryad Arbor', 'Land Creature — Forest Dryad', { mana_value: 0 }),
      deckCardOf('ring', 'Sol Ring', 'Artifact', { mana_value: 1 }),
      deckCardOf('signet', 'Arcane Signet', 'Artifact', { mana_value: 2 }),
      deckCardOf('little', 'Little Girl', 'Creature — Human', { mana_value: 0.5 }),
      deckCardOf('ulamog', 'Ulamog, the Infinite Gyre', 'Legendary Creature — Eldrazi', { mana_value: 11 }),
      deckCardOf('emrakul', 'Emrakul, the Aeons Torn', 'Legendary Creature — Eldrazi', { mana_value: 15 }),
      deckCardOf('blightsteel', 'Blightsteel Colossus', 'Artifact Creature — Phyrexian Golem', { mana_value: 12 }),
      deckCardOf('mdfc', 'Sink into Stupor // Soporific Springs', 'Instant // Land', { mana_value: 3 }),
      deckCardOf('six', 'Myojin of Night\'s Reach', 'Legendary Creature — Spirit', { mana_value: 6 }),
      deckCardOf('seven', 'Avenger of Zendikar', 'Creature — Elemental', { mana_value: 7 }),
    ]);

    await pressButtonMenuItem(deckMenuButton('Group, Type'), 'Mana value');

    expect(groupHeaders(deck)).toEqual(['Commander, 1', '0, 2', '1, 1', '2, 1', '3, 1', '6, 1', '7+, 4', 'Lands, 1']);
    expect(menuButtonNames(pushedScreen())).toEqual(['Group, Mana value', 'Sort, Name, A to Z']);
  });

  test('groups by color: White, Blue, Black, Red, Green, Multicolor, Colorless', async () => {
    const deck = await openDeckWithCards([
      commander,
      deckCardOf('tower', 'Command Tower', 'Land'),
      deckCardOf('ring', 'Sol Ring', 'Artifact'),
      deckCardOf('pyroblast', 'Pyroblast', 'Instant', { colors: ['R'] }),
      deckCardOf('swords', 'Swords to Plowshares', 'Instant', { colors: ['W'] }),
      deckCardOf('vindicate', 'Vindicate', 'Sorcery', { colors: ['W', 'B'] }),
      deckCardOf('birds', 'Birds of Paradise', 'Creature — Bird', { colors: ['G'] }),
      deckCardOf('study', 'Rhystic Study', 'Enchantment', { colors: ['U'] }),
      deckCardOf('tutor', 'Demonic Tutor', 'Sorcery', { colors: ['B'] }),
    ]);

    await pressButtonMenuItem(deckMenuButton('Group, Type'), 'Color');

    expect(groupHeaders(deck)).toEqual([
      'Commander, 1',
      'White, 1',
      'Blue, 1',
      'Black, 1',
      'Red, 1',
      'Green, 1',
      'Multicolor, 1',
      'Colorless, 2',
    ]);
  });

  test('groups by rarity: Mythic, Rare, Uncommon, Common, Special, with bonus cards in Special', async () => {
    const deck = await openDeckWithCards([
      commander,
      deckCardOf('common', 'Arcane Signet', 'Artifact', { rarity: 'common' }),
      deckCardOf('special', 'Sol Ring', 'Artifact', { rarity: 'special' }),
      deckCardOf('bonus', 'Mana Crypt', 'Artifact', { rarity: 'bonus' }),
      deckCardOf('mythic', 'Jeweled Lotus', 'Artifact', { rarity: 'mythic' }),
      deckCardOf('rare', 'Smothering Tithe', 'Enchantment', { rarity: 'rare' }),
      deckCardOf('uncommon', 'Swords to Plowshares', 'Instant', { rarity: 'uncommon' }),
    ]);

    await pressButtonMenuItem(deckMenuButton('Group, Type'), 'Rarity');

    expect(groupHeaders(deck)).toEqual(['Commander, 1', 'Mythic, 1', 'Rare, 1', 'Uncommon, 1', 'Common, 1', 'Special, 2']);
  });

  test('None puts the main deck in one group after the commanders', async () => {
    const deck = await openDeckWithCards([
      commander,
      deckCardOf('tower', 'Command Tower', 'Land'),
      deckCardOf('ring', 'Sol Ring', 'Artifact'),
      deckCardOf('birds', 'Birds of Paradise', 'Creature — Bird'),
    ]);

    await pressButtonMenuItem(deckMenuButton('Group, Type'), 'None');

    expect(groupHeaders(deck)).toEqual(['Commander, 1', 'Main deck, 3']);
    expect(tileNames(deck)).toEqual(["Atraxa, Praetors' Voice", 'Birds of Paradise', 'Command Tower', 'Sol Ring']);
  });

  test('the symbol is rectangle.3.group in the text color for Type and primary lime for any other grouping', async () => {
    await openDeckWithCards([deckCardOf('ring', 'Sol Ring', 'Artifact')]);
    expect(symbolNames(deckMenuButton('Group, Type'))).toEqual(['rectangle.3.group']);
    expect(symbolTintColor(deckMenuButton('Group, Type'))).toBe(text);

    await pressButtonMenuItem(deckMenuButton('Group, Type'), 'Rarity');
    expect(symbolTintColor(deckMenuButton('Group, Rarity'))).toBe(primary);

    await pressButtonMenuItem(deckMenuButton('Group, Rarity'), 'Type');
    expect(symbolTintColor(deckMenuButton('Group, Type'))).toBe(text);
  });
});

describe('the sort button', () => {
  const cards = [
    deckCardOf('ring', 'Sol Ring', 'Artifact', { mana_value: 1, added_at: '2026-10-15T09:00:00.000Z', price: { amount: '1.25', currency: 'USD', finish: 'nonfoil', stale: false } }),
    deckCardOf('signet', 'Arcane Signet', 'Artifact', { mana_value: 2, added_at: '2026-10-15T11:00:00.000Z', price: null }),
    deckCardOf('vault', 'Mana Vault', 'Artifact', { mana_value: 1, added_at: '2026-10-15T10:00:00.000Z', price: { amount: '40.00', currency: 'USD', finish: 'nonfoil', stale: false } }),
    deckCardOf('lotus', 'Jeweled Lotus', 'Artifact', { mana_value: 0, added_at: '2026-10-15T08:00:00.000Z', price: { amount: '9.50', currency: 'USD', finish: 'nonfoil', stale: false } }),
  ];

  test('opens a native menu titled "Sort by" with Name checked A to Z, and VoiceOver reads "Sort, Name, A to Z"', async () => {
    const deck = await openDeckWithCards(cards);

    expect(buttonMenu(deckMenuButton('Sort, Name, A to Z'))).toEqual({
      title: 'Sort by',
      items: [
        { title: 'Name', checked: true, symbol: 'arrow.up' },
        { title: 'Mana value', checked: false, symbol: undefined },
        { title: 'Price', checked: false, symbol: undefined },
        { title: 'Recently added', checked: false, symbol: undefined },
      ],
    });
    expect(symbolNames(deckMenuButton('Sort, Name, A to Z'))).toEqual(['arrow.up.arrow.down']);
    expect(tileNames(deck)).toEqual(['Arcane Signet', 'Jeweled Lotus', 'Mana Vault', 'Sol Ring']);
  });

  test.each([
    {
      title: 'Mana value',
      spoken: 'Sort, Mana value, low to high',
      sorted: ['Jeweled Lotus', 'Mana Vault', 'Sol Ring', 'Arcane Signet'],
      reversedSpoken: 'Sort, Mana value, high to low',
      reversed: ['Arcane Signet', 'Mana Vault', 'Sol Ring', 'Jeweled Lotus'],
      reversedSymbol: 'arrow.down',
    },
    {
      title: 'Price',
      spoken: 'Sort, Price, high to low',
      sorted: ['Mana Vault', 'Jeweled Lotus', 'Sol Ring', 'Arcane Signet'],
      reversedSpoken: 'Sort, Price, low to high',
      reversed: ['Sol Ring', 'Jeweled Lotus', 'Mana Vault', 'Arcane Signet'],
      reversedSymbol: 'arrow.up',
    },
    {
      title: 'Recently added',
      spoken: 'Sort, Recently added, newest first',
      sorted: ['Arcane Signet', 'Mana Vault', 'Sol Ring', 'Jeweled Lotus'],
      reversedSpoken: 'Sort, Recently added, oldest first',
      reversed: ['Jeweled Lotus', 'Sol Ring', 'Mana Vault', 'Arcane Signet'],
      reversedSymbol: 'arrow.up',
    },
  ])('sorts by $title, and tapping it again reverses the sort', async ({ title, spoken, sorted, reversedSpoken, reversed, reversedSymbol }) => {
    const deck = await openDeckWithCards(cards);

    await pressButtonMenuItem(deckMenuButton('Sort, Name, A to Z'), title);

    expect(tileNames(deck)).toEqual(sorted);
    expect(symbolTintColor(deckMenuButton(spoken))).toBe(primary);

    await pressButtonMenuItem(deckMenuButton(spoken), title);

    expect(tileNames(deck)).toEqual(reversed);
    expect(buttonMenu(deckMenuButton(reversedSpoken)).items.filter((item) => item.checked)).toEqual([
      { title, checked: true, symbol: reversedSymbol },
    ]);
  });

  test('tapping Name reverses it to Z to A in primary lime, and again back to A to Z in the text color', async () => {
    const deck = await openDeckWithCards(cards);
    expect(symbolTintColor(deckMenuButton('Sort, Name, A to Z'))).toBe(text);

    await pressButtonMenuItem(deckMenuButton('Sort, Name, A to Z'), 'Name');

    expect(tileNames(deck)).toEqual(['Sol Ring', 'Mana Vault', 'Jeweled Lotus', 'Arcane Signet']);
    expect(symbolTintColor(deckMenuButton('Sort, Name, Z to A'))).toBe(primary);

    await pressButtonMenuItem(deckMenuButton('Sort, Name, Z to A'), 'Name');

    expect(tileNames(deck)).toEqual(['Arcane Signet', 'Jeweled Lotus', 'Mana Vault', 'Sol Ring']);
    expect(symbolTintColor(deckMenuButton('Sort, Name, A to Z'))).toBe(text);
  });

  test('sorts inside each group, and the commanders stay first', async () => {
    const deck = await openDeckWithCards([
      commander,
      ...cards,
      deckCardOf('birds', 'Birds of Paradise', 'Creature — Bird', { mana_value: 1 }),
      deckCardOf('titan', 'Primeval Titan', 'Creature — Giant', { mana_value: 6 }),
    ]);

    await pressButtonMenuItem(deckMenuButton('Sort, Name, A to Z'), 'Mana value');
    await pressButtonMenuItem(deckMenuButton('Sort, Mana value, low to high'), 'Mana value');

    expect(groupHeaders(deck)).toEqual(['Commander, 1', 'Creatures, 2', 'Artifacts, 4']);
    expect(tileNames(deck)).toEqual([
      "Atraxa, Praetors' Voice",
      'Primeval Titan',
      'Birds of Paradise',
      'Arcane Signet',
      'Mana Vault',
      'Sol Ring',
      'Jeweled Lotus',
    ]);
  });
});

describe('the group and sort choices', () => {
  test('apply to every deck and stay when the deck screen opens again', async () => {
    const cards = [deckCardOf('ring', 'Sol Ring', 'Artifact', { mana_value: 1 }), deckCardOf('signet', 'Arcane Signet', 'Artifact')];
    ownDecks([
      { name: 'Atraxa', priority: 'medium', card_count: 2, cards },
      { name: 'Kinnan', priority: 'medium', card_count: 2, cards },
    ]);
    await renderApp();
    await pressTab('Decks');
    await openDeckNamed('Atraxa');
    await pressButtonMenuItem(deckMenuButton('Group, Type'), 'Mana value');
    await pressButtonMenuItem(deckMenuButton('Sort, Name, A to Z'), 'Price');

    await pressHeaderButton(pushedScreen(), 'Close');
    const kinnan = await openDeckNamed('Kinnan');

    expect(menuButtonNames(pushedScreen())).toEqual(['Group, Mana value', 'Sort, Price, high to low']);
    expect(groupHeaders(kinnan)).toEqual(['Commander', '1, 1', '2, 1']);
  });

  test('go back to Type and Name, A to Z after a restart of the app', async () => {
    await openDeckWithCards([deckCardOf('ring', 'Sol Ring', 'Artifact')]);
    await pressButtonMenuItem(deckMenuButton('Group, Type'), 'Rarity');
    await pressButtonMenuItem(deckMenuButton('Sort, Name, A to Z'), 'Price');

    await restartTheApp();
    await pressTab('Decks');
    await openDeckNamed('Atraxa');

    expect(menuButtonNames(pushedScreen())).toEqual(['Group, Type', 'Sort, Name, A to Z']);
  });

  test('the buttons show only on the Cards tab of a deck with cards', async () => {
    const deck = await openDeckWithCards([deckCardOf('ring', 'Sol Ring', 'Artifact')]);

    await fireEvent.press(deck.getByRole('radio', { name: 'History' }));

    expect(menuButtonNames(pushedScreen())).toEqual([]);
  });

  test('an empty deck shows no group and sort buttons', async () => {
    const deck = await openDeckWithCards([]);

    expect(deck.getByText('No cards yet')).toBeOnTheScreen();
    expect(menuButtonNames(pushedScreen())).toEqual([]);
  });
});
