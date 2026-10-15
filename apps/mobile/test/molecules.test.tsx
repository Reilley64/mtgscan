import { act, fireEvent, isHiddenFromAccessibility, render, screen, within } from '@testing-library/react-native';
import { useState } from 'react';
import { processColor, StyleSheet, View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { MenuButton } from '@/components/atoms/menu-button';
import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { QuickActionButton } from '@/components/atoms/quick-action-button';
import { Text } from '@/components/atoms/text';
import { AccountCard } from '@/components/molecules/account-card';
import { BatchButton } from '@/components/molecules/batch-button';
import { Brand } from '@/components/molecules/brand';
import { CardGrid, CardGridSkeleton } from '@/components/molecules/card-grid';
import { CardHero } from '@/components/molecules/card-hero';
import { LargeCardImage } from '@/components/molecules/large-card-image';
import { ReadFailure } from '@/components/molecules/read-failure';
import { BracketSignalRow } from '@/components/molecules/bracket-signal-row';
import { RuleRow } from '@/components/molecules/rule-row';
import { CardTile } from '@/components/molecules/card-tile';
import { CardChip } from '@/components/molecules/card-chip';
import { ChangeLine } from '@/components/molecules/change-line';
import { CommanderGalleryCard, DeckBanner } from '@/components/molecules/commander-card';
import { ChipGroup, SelectableChips } from '@/components/molecules/chip-group';
import { CopyMeta } from '@/components/molecules/copy-meta';
import { DisclosureRow } from '@/components/molecules/disclosure-row';
import { EmptyState } from '@/components/molecules/empty-state';
import {
  DashedCardFrame,
  EmptyBinderSlots,
  GhostBatchRows,
  GhostCommanderCard,
  GhostNeedsYouItems,
} from '@/components/molecules/empty-state-illustrations';
import { PriceLine } from '@/components/molecules/price-line';
import { PullIndicator } from '@/components/molecules/pull-indicator';
import { FailureNotice } from '@/components/molecules/failure-notice';
import { GalleryCard } from '@/components/molecules/gallery-card';
import { ListRow } from '@/components/molecules/list-row';
import { QuickActionBar } from '@/components/molecules/quick-action-bar';
import { SaveBar } from '@/components/molecules/save-bar';
import { SheetSection } from '@/components/molecules/sheet-section';
import { SortButton } from '@/components/molecules/sort-button';
import { GroupButton } from '@/components/molecules/group-button';
import { Stepper } from '@/components/molecules/stepper';
import { StepperRow } from '@/components/molecules/stepper-row';
import { SwipeToConfirm } from '@/components/molecules/swipe-to-confirm';
import { WarningLine } from '@/components/molecules/warning-line';
import { SwitchRow } from '@/components/molecules/switch-row';
import { SymbolText } from '@/components/molecules/symbol-text';
import { ThumbnailChip } from '@/components/molecules/thumbnail-chip';
import { ToggleGroup } from '@/components/molecules/toggle-group';
import { ValueRow } from '@/components/molecules/value-row';

import { liquidGlassIsAvailable } from './fake-glass-effect';
import { scanFeedback } from './fake-scan-feedback';
import {
  backdropOf,
  beginSwipe,
  blocksColored,
  blurredImageUris,
  cardImageOutline,
  cardImageUri,
  appearsBefore,
  buttonMenu,
  cardSheen,
  splitColorsBehind,
  dashedOutlinesColored,
  fadesDown,
  glassEffect,
  imageFrames,
  heightsAround,
  imageSources,
  imageTintColor,
  menuButton,
  menuButtonNames,
  opacityOf,
  pressButtonMenuItem,
  showsSpinner,
  sideColumnWidths,
  swipeHandleMovesAfterRelease,
  swipeHandlePosition,
  swipeRight,
  symbolIn,
  symbolNames,
  symbolSizes,
  symbolTintColor,
  touchTarget,
  widthsAround,
} from './native-ui';
import { tokenColors } from './token-colors';

const { primary: lime, onPrimary, surface, surfaceControl, surfaceRaised, line, text: white, textMuted, textDim, textPrice, warning, danger, info } = tokenColors;
const solRing = 'https://cards.scryfall.io/normal/front/sol-ring.jpg';
const solRingArtCrop = 'https://cards.scryfall.io/art_crop/front/sol-ring.jpg';
const mh3Symbol = 'https://svgs.scryfall.io/sets/mh3.svg';
const conditions = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;

describe('ChipGroup', () => {
  function ConditionChips() {
    const [condition, setCondition] = useState<(typeof conditions)[number]>('NM');
    return <ChipGroup values={conditions} selected={condition} labelOf={(value) => value} onSelect={setCondition} />;
  }

  test('a chip group shows one chip per value with only the chosen one selected', async () => {
    await render(<ConditionChips />);

    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.getAllByRole('button', { selected: true })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'NM', selected: true })).toHaveStyle({ backgroundColor: lime });
  });

  test('pressing a chip selects it and clears the one selected before', async () => {
    await render(<ConditionChips />);

    await fireEvent.press(screen.getByRole('button', { name: 'LP' }));

    expect(screen.getByRole('button', { name: 'LP', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'NM', selected: false })).toHaveStyle({ backgroundColor: surfaceControl });
  });
});

test('selectable chips can show more than one chip selected', async () => {
  await render(
    <SelectableChips
      chips={[
        { label: 'Signed', selected: true, onPress: () => {} },
        { label: 'Trade binder', selected: true, onPress: () => {} },
        { label: 'Sold', selected: false, onPress: () => {} },
      ]}
    />,
  );

  expect(screen.getAllByRole('button', { selected: true }).map((chip) => within(chip).getByText(/./).props.children)).toEqual([
    'Signed',
    'Trade binder',
  ]);
  expect(screen.getByRole('button', { name: 'Signed', selected: true })).toHaveStyle({ backgroundColor: lime });
});

describe('ToggleGroup', () => {
  const sections = ['Copies', 'Decks', 'Prices', 'Rules'] as const;

  function CardPageSections({ onSelect = () => {} }: { onSelect?: (section: string) => void }) {
    const [section, setSection] = useState<(typeof sections)[number]>('Copies');
    return (
      <ToggleGroup
        values={sections}
        selected={section}
        labelOf={(value) => value}
        onSelect={(value) => {
          setSection(value);
          onSelect(value);
        }}
      />
    );
  }

  test('a toggle group has the chosen option checked and lime, and the others on the control surface', async () => {
    await render(<CardPageSections />);

    expect(screen.getByRole('radio', { name: 'Decks', checked: false })).toHaveStyle({ backgroundColor: surfaceControl });
    expect(screen.getByText('Decks')).toHaveStyle({ color: white });
    expect(screen.getByRole('radio', { name: 'Copies', checked: true })).toHaveStyle({ backgroundColor: lime });
    expect(screen.getByText('Copies')).toHaveStyle({ color: onPrimary });
    expect(screen.getAllByRole('radio', { checked: false })).toHaveLength(3);
  });

  test('pressing an option checks it and unchecks the one before', async () => {
    await render(<CardPageSections />);

    await fireEvent.press(screen.getByRole('radio', { name: 'Prices' }));

    expect(screen.getByRole('radio', { name: 'Prices', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Copies', checked: false })).toBeOnTheScreen();
  });

  test('pressing the checked option keeps it checked', async () => {
    const onSelect = jest.fn();
    await render(<CardPageSections onSelect={onSelect} />);

    await fireEvent.press(screen.getByRole('radio', { name: 'Copies' }));

    expect(screen.getByRole('radio', { name: 'Copies', checked: true })).toBeOnTheScreen();
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('each option has a 44 pt touch target', async () => {
    await render(<CardPageSections />);

    expect(touchTarget(screen.getByRole('radio', { name: 'Rules' })).height).toBe(44);
  });
});

describe('ListRow', () => {
  test('a list row shows its title and detail on the surface', async () => {
    await render(<ListRow title="Lightning Bolt" detail="M10 146" />);

    expect(screen.getByText('Lightning Bolt')).toHaveStyle({ color: white, fontSize: 14, fontWeight: '700' });
    expect(screen.getByText('M10 146')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  test('a list row with an action is a button named by its title and detail', async () => {
    const onPress = jest.fn();
    await render(
      <ListRow title="Lightning Bolt" detail="M10 146" leading={<CardThumbnail uri={undefined} />} onPress={onPress} />,
    );

    const row = screen.getByRole('button', { name: 'Lightning Bolt, M10 146' });
    await fireEvent.press(row);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(row).toHaveStyle({ backgroundColor: surface });
  });

  test('a list row with a trailing price shows it after the title and adds it to the row name', async () => {
    await render(
      <ListRow
        title="Lightning Bolt"
        detail="M10 146 · NM · English"
        trailing={{ content: <PriceLine price="$1.87" stale={false} />, spoken: '$1.87' }}
        onPress={() => {}}
      />,
    );

    const row = screen.getByRole('button', { name: 'Lightning Bolt, M10 146 · NM · English, $1.87' });
    expect(appearsBefore(within(row).getByText('Lightning Bolt'), within(row).getByText('$1.87'))).toBe(true);
  });

  test('a list row with a status chip shows it under its detail and adds its spoken text to the row name', async () => {
    await render(
      <ListRow
        title="Kinnan"
        detail="High priority · 87 cards"
        status={{ chip: { label: 'Adds a violation', tone: 'danger' }, spoken: 'Adds a violation to Kinnan: singleton' }}
        onPress={() => {}}
      />,
    );

    const row = screen.getByRole('button', { name: 'Kinnan, High priority · 87 cards, Adds a violation to Kinnan: singleton' });
    const chip = within(row).getByText('Adds a violation');
    expect(chip).toHaveStyle({ color: danger, fontSize: 11, fontWeight: '700' });
    expect(appearsBefore(within(row).getByText('High priority · 87 cards'), chip)).toBe(true);
  });

  test('a list row with only a title has a 44 pt touch target', async () => {
    await render(<ListRow title="Lightning Bolt" onPress={() => {}} />);

    expect(touchTarget(screen.getByRole('button', { name: 'Lightning Bolt' })).height).toBeGreaterThanOrEqual(44);
  });
});

describe('ListRow with a check', () => {
  test('a checked list row is a checked checkbox named by its title and detail, with a lime check mark', async () => {
    const onPress = jest.fn();
    await render(<ListRow title="Signed" detail="3 copies" checked onPress={onPress} />);

    const row = screen.getByRole('checkbox', { name: 'Signed, 3 copies' });
    await fireEvent.press(row);

    expect(row).toBeChecked();
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(symbolNames(row)).toEqual(['checkmark.circle.fill']);
    expect(symbolSizes(row)).toEqual([22]);
    expect(symbolTintColor(row)).toBe(lime);
    expect(touchTarget(row).height).toBeGreaterThanOrEqual(44);
  });

  test('an unchecked list row is an unchecked checkbox with an empty circle in text dim', async () => {
    await render(<ListRow title="Signed" detail="0 copies" checked={false} onPress={() => {}} />);

    const row = screen.getByRole('checkbox', { name: 'Signed, 0 copies' });
    expect(row).not.toBeChecked();
    expect(symbolNames(row)).toEqual(['circle']);
    expect(symbolTintColor(row)).toBe(textDim);
  });

  test('a list row with a menu keeps the check row as one checkbox and puts the menu button beside it on the same surface', async () => {
    const onPress = jest.fn();
    await render(
      <ListRow
        title="Signed"
        detail="3 copies"
        checked
        onPress={onPress}
        menu={<MenuButton accessibilityLabel="More, Signed" actions={[{ title: 'Rename', onSelect: () => {} }]} />}
      />,
    );

    const row = screen.getByRole('checkbox', { name: 'Signed, 3 copies' });
    await fireEvent.press(row);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(menuButtonNames(row)).toEqual([]);
    expect(menuButtonNames(row.parent!)).toEqual(['More, Signed']);
    expect(backdropOf(row)).toBe(row);
    expect(row.parent).toHaveStyle({ backgroundColor: surface, flexDirection: 'row' });
  });
});

describe('DisclosureRow', () => {
  test('a disclosure row is a button on the surface with its content and a text dim chevron', async () => {
    const onPress = jest.fn();
    await render(
      <DisclosureRow accessibilityLabel="Add user tags" onPress={onPress}>
        <Text>Add user tags</Text>
      </DisclosureRow>,
    );

    const row = screen.getByRole('button', { name: 'Add user tags' });
    await fireEvent.press(row);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(row).toHaveStyle({ backgroundColor: surface });
    expect(symbolNames(row)).toEqual(['chevron.right']);
    expect(symbolSizes(row)).toEqual([14]);
    expect(symbolTintColor(row)).toBe(textDim);
    expect(touchTarget(row).height).toBeGreaterThanOrEqual(44);
  });
});

describe('ValueRow', () => {
  test('a value row is one element on the surface, with its label in muted text and its value', async () => {
    await render(
      <ValueRow label="Added" spokenValue="12 October 2026">
        <Text>12 October 2026</Text>
      </ValueRow>,
    );

    const row = screen.getByLabelText('Added, 12 October 2026');
    expect(row).toHaveStyle({ backgroundColor: surface, borderRadius: 12 });
    expect(within(row).getByText('Added')).toHaveStyle({ color: textMuted, fontSize: 14 });
    expect(within(row).getByText('12 October 2026')).toHaveStyle({ color: white });
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  test('a value row passes its hint to VoiceOver', async () => {
    await render(
      <ValueRow label="Current price" spokenValue="$0.35" accessibilityHint="The price may be out of date.">
        <PriceLine price="$0.35" stale />
      </ValueRow>,
    );

    expect(screen.getByLabelText('Current price, $0.35')).toHaveProp('accessibilityHint', 'The price may be out of date.');
  });
});

describe('LargeCardImage', () => {
  test('a large card image is one image named by the card, with its sheen', async () => {
    await render(<LargeCardImage uri={solRing} name="Sol Ring" sheen="etched" />);

    const image = screen.getByRole('image', { name: 'Sol Ring' });
    expect(cardImageUri(image)).toBe(solRing);
    expect(cardSheen(image)).toMatchObject({ opacity: expect.closeTo(0.3) });
    expect(image).toHaveStyle({ width: '55%' });
  });
});

describe('ReadFailure', () => {
  test('a read failure names what did not load, asks to check the connection, and tries again', async () => {
    const onTryAgain = jest.fn();
    await render(<ReadFailure illustration={null} title="Could not load this card" onTryAgain={onTryAgain} />);

    expect(screen.getByText('Could not load this card')).toBeOnTheScreen();
    expect(screen.getByText('Check your connection.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });
});

describe('ChangeLine', () => {
  test.each([
    ['incoming', '+', tokenColors.incoming],
    ['outgoing', '−', tokenColors.outgoing],
  ] as const)('an %s change line is one row with a %s sign in its color, the thumbnail, the name, and the meta', async (direction, sign, color) => {
    await render(<ChangeLine direction={direction} uri={solRing} name="Sol Ring" detail="Artifact" />);

    const row = screen.getByLabelText(`${sign}, Sol Ring, Artifact`);
    expect(within(row).getByText(sign)).toHaveStyle({ color, fontWeight: '700' });
    expect(within(row).getByText('Sol Ring')).toHaveStyle({ color: white, fontWeight: '700' });
    expect(within(row).getByText('Artifact')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(cardImageUri(row)).toBe(solRing);
  });
});

describe('WarningLine', () => {
  test('a warning line is named by its message, with a shield and the message in warning', async () => {
    await render(<WarningLine message="Sol Ring is protected. Reverting unprotects it." />);

    const line = screen.getByLabelText('Sol Ring is protected. Reverting unprotects it.');
    expect(within(line).getByText('Sol Ring is protected. Reverting unprotects it.')).toHaveStyle({ color: tokenColors.warning, fontSize: 14 });
    expect(symbolNames(line)).toEqual(['shield.fill']);
    expect(symbolSizes(line)).toEqual([11]);
    expect(symbolTintColor(line)).toBe(tokenColors.warning);
  });
});

describe('CardChip', () => {
  test('a card chip shows the card thumbnail and name on surface raised, and is not a button', async () => {
    await render(<CardChip uri={solRing} name="Sol Ring" />);

    const chip = screen.getByLabelText('Sol Ring');
    expect(chip).toHaveStyle({ backgroundColor: surfaceRaised, borderRadius: 12 });
    expect(imageSources(chip)).toEqual([solRing]);
    expect(within(chip).getByText('Sol Ring')).toHaveStyle({ color: white, fontSize: 11, fontWeight: '700' });
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });
});

describe('RuleRow', () => {
  test('a rule row in danger shows the rule in danger body strong, the citation link at the end of its line, the message and the hint in meta text, and the card chips', async () => {
    const onOpenCitation = jest.fn();
    await render(
      <RuleRow
        tone="danger"
        rule="Singleton"
        citation={{ label: 'CR 903.5b', onPress: onOpenCitation }}
        message="2 copies of Sol Ring."
        cards={[{ key: 'copy-1', name: 'Sol Ring', uri: solRing }]}
        hint="Remove 1 Sol Ring."
      />,
    );

    const rule = screen.getByText('Singleton');
    expect(rule).toHaveStyle({ color: danger, fontSize: 14, fontWeight: '700' });
    const link = screen.getByRole('link', { name: 'CR 903.5b' });
    expect(link).toHaveStyle({ color: lime, fontWeight: '700' });
    expect(appearsBefore(rule, link)).toBe(true);
    expect(screen.getByText('2 copies of Sol Ring.')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(screen.getByLabelText('Sol Ring')).toBeOnTheScreen();
    expect(screen.getByText('Remove 1 Sol Ring.')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(appearsBefore(screen.getByLabelText('Sol Ring'), screen.getByText('Remove 1 Sol Ring.'))).toBe(true);

    await fireEvent.press(link);

    expect(onOpenCitation).toHaveBeenCalledTimes(1);
  });

  test('a rule row in warning shows the rule in warning, with no link and no hint', async () => {
    await render(<RuleRow tone="warning" rule="Partner" message="mtgscan cannot read the partner ability of Tymna." cards={[]} />);

    expect(screen.getByText('Partner')).toHaveStyle({ color: warning, fontWeight: '700' });
    expect(screen.queryByRole('link')).not.toBeOnTheScreen();
    expect(screen.getByText('mtgscan cannot read the partner ability of Tymna.')).toHaveStyle({ color: textMuted });
  });
});

describe('BracketSignalRow', () => {
  test('a bracket signal row shows its title in body strong, its lowest bracket in info at the end of the line, its source in meta text, its card chips, and its details', async () => {
    await render(
      <BracketSignalRow
        title="Two-card combos: 1"
        source="heuristic"
        lowestBracket="Bracket 4"
        cards={[{ key: 'copy-1', name: 'Sol Ring', uri: solRing }]}
        details={['Infinite colorless mana (Commander Spellbook, ruthless)']}
      />,
    );

    const title = screen.getByText('Two-card combos: 1');
    expect(title).toHaveStyle({ color: white, fontSize: 14, fontWeight: '700' });
    const lowestBracket = screen.getByText('Bracket 4');
    expect(lowestBracket).toHaveStyle({ color: info });
    expect(appearsBefore(title, lowestBracket)).toBe(true);
    expect(screen.getByText('heuristic')).toHaveStyle({ color: textMuted, fontSize: 12 });
    const detail = screen.getByText('Infinite colorless mana (Commander Spellbook, ruthless)');
    expect(detail).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(appearsBefore(screen.getByLabelText('Sol Ring'), detail)).toBe(true);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });
});

describe('CardHero', () => {
  test('a card hero shows the card image, named by the card, over its art blurred', async () => {
    await render(<CardHero uri={solRing} artUri={solRingArtCrop} name="Sol Ring" />);

    const hero = screen.getByRole('image', { name: 'Sol Ring' });
    expect(cardImageUri(hero)).toBe(solRing);
    expect(cardSheen(hero)).toBeNull();
    expect(blurredImageUris()).toEqual([solRingArtCrop]);
    expect(screen.getAllByRole('image')).toHaveLength(1);
  });

  test('a card hero passes its sheen to the card image', async () => {
    await render(<CardHero uri={solRing} artUri={solRingArtCrop} name="Sol Ring" sheen="foil" />);

    expect(cardSheen(screen.getByRole('image', { name: 'Sol Ring' }))).toMatchObject({ opacity: expect.closeTo(0.3) });
  });
});

describe('SymbolText', () => {
  const scryfallSymbols = [
    '{T}', '{Q}', '{E}', '{P}', '{PW}', '{CHAOS}', '{A}', '{TK}', '{X}', '{Y}', '{Z}', '{0}', '{½}', '{1}', '{2}', '{3}', '{4}', '{5}', '{6}', '{7}', '{8}', '{9}', '{10}', '{11}', '{12}', '{13}', '{14}', '{15}', '{16}', '{17}', '{18}', '{19}', '{20}', '{100}', '{1000000}', '{∞}', '{W/U}', '{W/B}', '{B/R}', '{B/G}', '{U/B}', '{U/R}', '{R/G}', '{R/W}', '{G/W}', '{G/U}', '{B/G/P}', '{B/R/P}', '{G/U/P}', '{G/W/P}', '{R/G/P}', '{R/W/P}', '{U/B/P}', '{U/R/P}', '{W/B/P}', '{W/U/P}', '{C/W}', '{C/U}', '{C/B}', '{C/R}', '{C/G}', '{2/W}', '{2/U}', '{2/B}', '{2/R}', '{2/G}', '{H}', '{W/P}', '{U/P}', '{B/P}', '{R/P}', '{G/P}', '{C/P}', '{HW}', '{HR}', '{W}', '{U}', '{B}', '{R}', '{G}', '{C}', '{S}', '{L}', '{D}',
  ];
  const { manaGeneric, manaWhite, manaBlue, manaGreen, manaGlyph } = tokenColors;

  test.each(scryfallSymbols)('%s, which Scryfall lists, shows as a Mana font glyph with no braces left', async (symbol) => {
    await render(<SymbolText text={symbol} />);

    expect(screen.queryByText(/[{}]/)).not.toBeOnTheScreen();
    expect(screen.getByLabelText(/^[^{}]+$/)).toBeOnTheScreen();
    for (const glyph of screen.getAllByText(/^[\u{e000}-\u{f8ff}]$/u)) {
      expect(glyph).toHaveStyle({ fontFamily: 'Mana' });
    }
  });

  test.each([
    ['{T}: Add {G}.', 'tap: Add green mana.'],
    ['{2}{G}', 'two generic mana green mana'],
    ['{C}', 'colorless mana'],
    ['{X}', 'X generic mana'],
    ['{W/U}', 'white or blue mana'],
    ['{2/W}', 'two generic or white mana'],
    ['{G/P}', 'Phyrexian green mana'],
    ['{B/G/P}', 'Phyrexian black or green mana'],
    ['{Q}', 'untap'],
    ['{E}{E}', 'energy energy'],
    ['{S}', 'snow mana'],
  ])('VoiceOver reads %s as "%s"', async (text, spoken) => {
    await render(<SymbolText text={text} />);

    expect(screen.getByLabelText(spoken)).toBeOnTheScreen();
  });

  test('a mana symbol is its glyph on a circle of its mana color, inline with the text', async () => {
    await render(<SymbolText text="{T}: Add {G}." />);

    const green = screen.getByText('\u{e604}');
    expect(green).toHaveStyle({ color: manaGlyph });
    expect(backdropOf(green)).toHaveStyle({ backgroundColor: manaGreen });
    expect(backdropOf(screen.getByText('\u{e61a}'))).toHaveStyle({ backgroundColor: manaGeneric });
    expect(screen.getByLabelText('tap: Add green mana.')).toHaveTextContent('\u{e61a}: Add \u{e604}.');
  });

  test('a hybrid mana symbol is a circle split in its two colors, with both glyphs', async () => {
    await render(<SymbolText text="{W/U}" />);

    const white = screen.getByText('\u{e600}');
    expect(splitColorsBehind(white)).toEqual([manaWhite, manaBlue]);
    expect(splitColorsBehind(screen.getByText('\u{e601}'))).toEqual([manaWhite, manaBlue]);
  });

  test('an energy symbol is its glyph in the text color, with no circle', async () => {
    await render(<SymbolText text="You get {E}." />);

    const energy = screen.getByText('\u{e907}');
    expect(energy).toHaveStyle({ fontFamily: 'Mana', fontSize: 12, color: white });
    expect(widthsAround(energy)).toEqual([]);
  });

  test.each(['Pay {FOO}.', 'Pay {G.', 'Pay {}.'])('an unknown symbol in "%s" stays as its plain text', async (text) => {
    await render(<SymbolText text={text} />);

    expect(screen.getByText(text)).toBeOnTheScreen();
    expect(screen.getByLabelText(text)).toBeOnTheScreen();
  });
});

describe('SwitchRow', () => {
  function ScanSoundsRow() {
    const [on, setOn] = useState(true);
    return <SwitchRow title="Scan sounds" value={on} onValueChange={setOn} />;
  }

  test('a switch row is one switch named by its title, with its state', async () => {
    await render(<ScanSoundsRow />);

    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.getByRole('switch', { name: 'Scan sounds' })).toBeChecked();
  });

  test('pressing anywhere on a switch row turns it off and on', async () => {
    await render(<ScanSoundsRow />);
    const row = screen.getByRole('switch', { name: 'Scan sounds' });

    await fireEvent.press(row);
    expect(row).not.toBeChecked();

    await fireEvent.press(row);
    expect(row).toBeChecked();
  });

  test('a switch row sits on the surface with a 44 pt touch target', async () => {
    await render(<ScanSoundsRow />);

    const row = screen.getByRole('switch', { name: 'Scan sounds' });
    expect(row).toHaveStyle({ backgroundColor: surface, borderRadius: 12 });
    expect(touchTarget(row).height).toBeGreaterThanOrEqual(44);
  });
});

describe('QuickActionBar', () => {
  test('a quick-action bar is one control-surface pill with a line-colored divider between its actions', async () => {
    await render(
      <View accessibilityLabel="Quick actions">
        <QuickActionBar>
          <QuickActionButton label="Nonfoil" onPress={() => {}} />
          <QuickActionButton label="M10" onPress={() => {}} />
          <QuickActionButton label="+1" onPress={() => {}} />
        </QuickActionBar>
      </View>,
    );

    const [bar] = screen.getByLabelText('Quick actions').children as ReturnType<typeof screen.getByLabelText>[];
    expect(bar).toHaveStyle({ backgroundColor: surfaceControl, borderRadius: 12, alignSelf: 'center' });
    const dividers = bar.children.filter((child) => typeof child !== 'string' && child.props.accessibilityRole !== 'button');
    expect(dividers).toHaveLength(2);
    dividers.forEach((divider) => expect(divider).toHaveStyle({ height: 16, borderColor: line }));
    expect(screen.getAllByRole('button').map((action) => action.props.accessibilityLabel)).toEqual(['Nonfoil', 'M10', '+1']);
  });

  test('on Liquid Glass, a quick-action bar is regular glass with no tint that reacts to touch', async () => {
    liquidGlassIsAvailable();
    await render(
      <QuickActionBar>
        <QuickActionButton label="Nonfoil" />
        <QuickActionButton label="+1" onPress={() => {}} />
      </QuickActionBar>,
    );

    const bar = backdropOf(screen.getByRole('button', { name: '+1' }));
    expect(glassEffect(bar)).toEqual({ style: 'regular', interactive: true, tintColor: undefined });
    expect(bar).toHaveStyle({ borderRadius: 12, alignSelf: 'center' });
  });
});

describe('ThumbnailChip', () => {
  test('a thumbnail chip centers its content between a thumbnail column and an accessory column of the same width', async () => {
    await render(
      <ThumbnailChip
        accessibilityLabel="Lightning Bolt, M10 146"
        thumbnail={<CardThumbnail uri={undefined} />}
        accessory={<Text>Open</Text>}>
        <Text className="text-center">Lightning Bolt</Text>
      </ThumbnailChip>,
    );

    expect(sideColumnWidths(screen.getByText('Lightning Bolt'))).toEqual({ start: 40, end: 40 });
  });

  test('a thumbnail chip without an accessory keeps the accessory column at the same width', async () => {
    await render(
      <ThumbnailChip accessibilityLabel="Recognizing card" thumbnail={<CardThumbnail uri={undefined} />}>
        <Text>Recognizing card</Text>
      </ThumbnailChip>,
    );

    expect(sideColumnWidths(screen.getByText('Recognizing card'))).toEqual({ start: 40, end: 40 });
  });

  test('without Liquid Glass, a thumbnail chip with an action is a button on a surface card with 8 px padding', async () => {
    const onPress = jest.fn();
    await render(
      <ThumbnailChip accessibilityLabel="Lightning Bolt, M10 146" thumbnail={<CardThumbnail uri={undefined} />} onPress={onPress}>
        <Text>Lightning Bolt</Text>
      </ThumbnailChip>,
    );

    const chip = screen.getByRole('button', { name: 'Lightning Bolt, M10 146' });
    await fireEvent.press(chip);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(chip).toHaveStyle({ padding: 8 });
    expect(touchTarget(chip).height).toBeGreaterThanOrEqual(44);
    expect(glassEffect(backdropOf(chip))).toBeNull();
    expect(backdropOf(chip)).toHaveStyle({ backgroundColor: surface, borderRadius: 12 });
  });

  test('on Liquid Glass, a thumbnail chip with an action sits on glass that reacts to touch', async () => {
    liquidGlassIsAvailable();
    await render(
      <ThumbnailChip accessibilityLabel="Lightning Bolt, M10 146" thumbnail={<CardThumbnail uri={undefined} />} onPress={() => {}}>
        <Text>Lightning Bolt</Text>
      </ThumbnailChip>,
    );

    const chip = screen.getByRole('button', { name: 'Lightning Bolt, M10 146' });
    expect(glassEffect(backdropOf(chip))).toEqual({ style: 'regular', interactive: true, tintColor: undefined });
    expect(backdropOf(chip)).toHaveStyle({ borderRadius: 12 });
  });

  test('on Liquid Glass, a thumbnail chip without an action is not a button and its glass does not react to touch', async () => {
    liquidGlassIsAvailable();
    await render(
      <ThumbnailChip accessibilityLabel="Plains, Basic land, not tracked" thumbnail={<CardThumbnail uri={undefined} />}>
        <Text>Plains</Text>
      </ThumbnailChip>,
    );

    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    expect(glassEffect(backdropOf(screen.getByLabelText('Plains, Basic land, not tracked')))).toEqual({
      style: 'regular',
      interactive: false,
      tintColor: undefined,
    });
  });
});

describe('SheetSection', () => {
  test('a sheet section has a lime body strong heading over its content', async () => {
    await render(
      <SheetSection title="Other options">
        <Text>Lightning Bolt</Text>
      </SheetSection>,
    );

    expect(screen.getByRole('header', { name: 'Other options' })).toHaveStyle({ color: lime, fontSize: 14, fontWeight: '700' });
    expect(screen.getByText('Lightning Bolt')).toBeOnTheScreen();
  });

  test('a sheet section with an action shows it on the right of its heading', async () => {
    const onEdit = jest.fn();
    await render(
      <SheetSection
        title="Basic lands"
        count={10}
        action={
          <Button onPress={onEdit}>
            <Text>Edit</Text>
          </Button>
        }>
        <Text>Island</Text>
      </SheetSection>,
    );

    expect(screen.getByRole('header', { name: 'Basic lands, 10' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Basic lands, 10' }).parent).toHaveStyle({ flexDirection: 'row', justifyContent: 'space-between' });
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});

describe('Stepper', () => {
  function CountedStepper({ initial }: { initial: number }) {
    const [count, setCount] = useState(initial);
    return <Stepper label="Island" value={count} min={0} max={99} onChange={setCount} />;
  }

  test('a stepper shows its count between a minus and a plus button that change it by one', async () => {
    await render(<CountedStepper initial={8} />);

    expect(screen.getByLabelText('Island, 8')).toHaveTextContent('8');
    await fireEvent.press(screen.getByRole('button', { name: 'Add one Island' }));
    expect(screen.getByLabelText('Island, 9')).toHaveTextContent('9');
    await fireEvent.press(screen.getByRole('button', { name: 'Remove one Island' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove one Island' }));
    expect(screen.getByLabelText('Island, 7')).toHaveTextContent('7');
    expect(symbolNames(screen.getByRole('button', { name: 'Remove one Island' }))).toEqual(['minus']);
    expect(symbolNames(screen.getByRole('button', { name: 'Add one Island' }))).toEqual(['plus']);
  });

  test('a stepper turns off minus at its minimum and plus at its maximum', async () => {
    await render(
      <>
        <Stepper label="Plains" value={0} min={0} max={99} onChange={() => {}} />
        <Stepper label="Island" value={99} min={0} max={99} onChange={() => {}} />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Remove one Plains' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add one Plains' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove one Island' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add one Island' })).toBeDisabled();
  });

  test('stepper buttons have a 44 pt touch target', async () => {
    await render(<Stepper label="Island" value={8} min={0} max={99} onChange={() => {}} />);

    for (const name of ['Remove one Island', 'Add one Island']) {
      const target = touchTarget(screen.getByRole('button', { name }));
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.width).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('StepperRow', () => {
  test('a stepper row shows the card thumbnail, the name, and a stepper for its count', async () => {
    const onChange = jest.fn();
    await render(<StepperRow uri={solRing} label="Island" value={8} min={0} max={99} onChange={onChange} />);

    expect(imageSources(screen.root!)).toEqual([solRing]);
    expect(screen.getByText('Island')).toHaveStyle({ color: white, fontSize: 14, fontWeight: '700' });
    expect(screen.getByLabelText('Island, 8')).toHaveTextContent('8');
    await fireEvent.press(screen.getByRole('button', { name: 'Add one Island' }));
    expect(onChange).toHaveBeenCalledWith(9);
  });
});

describe('SaveBar', () => {
  test('a save bar has Cancel and a primary Save N changes button', async () => {
    const onCancel = jest.fn();
    const onSave = jest.fn();
    await render(<SaveBar changeCount={2} saving={false} onCancel={onCancel} onSave={onSave} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save 2 changes' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save 2 changes' })).toHaveStyle({ backgroundColor: lime });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveStyle({ backgroundColor: surfaceControl });
  });

  test('a save bar with one change says Save 1 change, and with none turns Save off', async () => {
    await render(
      <>
        <SaveBar changeCount={1} saving={false} onCancel={() => {}} onSave={() => {}} />
        <SaveBar changeCount={0} saving={false} onCancel={() => {}} onSave={() => {}} />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Save 1 change' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save 0 changes' })).toBeDisabled();
  });

  test('while saving, Save is busy and Cancel is off', async () => {
    await render(<SaveBar changeCount={1} saving onCancel={() => {}} onSave={() => {}} />);

    expect(screen.getByRole('button', { name: 'Save 1 change' })).toBeBusy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});

describe('CardTile', () => {
  test('a card tile shows the card image with a muted set and collector number caption', async () => {
    await render(<CardTile uri={solRing} caption="CMM 464" accessibilityLabel="Sol Ring, CMM 464" />);

    const tile = screen.getByRole('image', { name: 'Sol Ring, CMM 464' });
    expect(cardImageUri(tile)).toBe(solRing);
    expect(screen.getByText('CMM 464')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  test('a card tile without a caption shows what it holds under the card image', async () => {
    await render(
      <CardTile uri={solRing} accessibilityLabel="Sol Ring, CMM 464">
        <Text>Under the card</Text>
      </CardTile>,
    );

    const tile = screen.getByRole('image', { name: 'Sol Ring, CMM 464' });
    expect(cardImageUri(tile)).toBe(solRing);
    expect(within(tile).getByText('Under the card')).toBeOnTheScreen();
    expect(screen.queryByText('CMM 464')).not.toBeOnTheScreen();
  });

  test('a card tile passes its sheen to the card image', async () => {
    await render(<CardTile uri={solRing} caption="CMM 464" sheen="etched" accessibilityLabel="Sol Ring, CMM 464, etched" />);

    expect(cardSheen(screen.getByRole('image', { name: 'Sol Ring, CMM 464, etched' }))).toMatchObject({ opacity: expect.closeTo(0.3) });
  });

  test('a card tile with an action is a button with its selected state', async () => {
    const onPress = jest.fn();
    await render(
      <CardTile uri={solRing} caption="CMM 464" accessibilityLabel="Sol Ring, CMM 464" selected={false} onPress={onPress} />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Sol Ring, CMM 464', selected: false }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('CMM 464')).toHaveStyle({ color: textMuted });
    expect(cardImageOutline(screen.getByRole('button'))).toMatchObject({ borderWidth: 2, borderColor: '#00000000' });
  });

  test('a card tile with an action has a 44 pt touch target', async () => {
    await render(
      <CardTile uri={solRing} caption="CMM 464" accessibilityLabel="Sol Ring, CMM 464" selected={false} onPress={() => {}} />,
    );

    expect(touchTarget(screen.getByRole('button', { name: 'Sol Ring, CMM 464' })).height).toBeGreaterThanOrEqual(44);
  });

  test('a selected card tile has a lime border around the image and a lime caption', async () => {
    await render(
      <CardTile uri={solRing} caption="CMM 464" accessibilityLabel="Sol Ring, CMM 464" selected onPress={() => {}} />,
    );

    expect(screen.getByRole('button', { name: 'Sol Ring, CMM 464', selected: true })).toBeOnTheScreen();
    expect(screen.getByText('CMM 464')).toHaveStyle({ color: lime });
    expect(cardImageOutline(screen.getByRole('button'))).toEqual({ borderColor: lime, borderWidth: 2, borderRadius: 8 });
  });

  test('a card tile with an action and no selected state is a button that runs its action', async () => {
    const onPress = jest.fn();
    await render(
      <CardTile uri={solRing} accessibilityLabel="Sol Ring, CMM 464, $1.25" onPress={onPress}>
        <PriceLine price="$1.25" stale={false} />
      </CardTile>,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Sol Ring, CMM 464, $1.25' }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(cardImageOutline(screen.getByRole('button'))).toMatchObject({ borderColor: '#00000000' });
  });

  test('a card tile with a count shows it as a ×N count badge at the top right of the card image', async () => {
    await render(<CardTile uri={solRing} count={8} accessibilityLabel="Island, 8" />);

    const badge = within(screen.getByRole('image', { name: 'Island, 8' })).getByText('×8');
    expect(badge.parent).toHaveStyle({ position: 'absolute', top: 4, right: 4 });
  });

  test('a card tile in a violation has a 2 px danger outline around the card image, and VoiceOver adds that it breaks a Commander rule', async () => {
    await render(<CardTile uri={solRing} accessibilityLabel="Sol Ring, C21 263" inViolation onPress={() => {}} />);

    const tile = screen.getByRole('button', { name: 'Sol Ring, C21 263, breaks a Commander rule' });
    expect(cardImageOutline(tile)).toEqual({ borderColor: danger, borderWidth: 2, borderRadius: 8 });
  });

  test('a card tile with a count in a violation has the danger outline, and VoiceOver adds that it breaks a Commander rule', async () => {
    await render(<CardTile uri={solRing} count={8} accessibilityLabel="Island, 8" inViolation />);

    const tile = screen.getByRole('image', { name: 'Island, 8, breaks a Commander rule' });
    expect(cardImageOutline(tile)).toEqual({ borderColor: danger, borderWidth: 2, borderRadius: 8 });
    expect(within(tile).getByText('×8')).toBeOnTheScreen();
  });

  test('a card tile with a count that is not in a violation has no visible outline', async () => {
    await render(<CardTile uri={solRing} count={8} accessibilityLabel="Island, 8" />);

    expect(cardImageOutline(screen.getByRole('image', { name: 'Island, 8' }))).toMatchObject({ borderColor: '#00000000' });
  });

  test('card tiles sit three to a row', async () => {
    await render(
      <CardGrid>
        <CardTile uri={solRing} caption="CMM 464" accessibilityLabel="Sol Ring, CMM 464" />
      </CardGrid>,
    );

    expect(screen.getByRole('image', { name: 'Sol Ring, CMM 464' }).parent).toHaveStyle({ width: '33.33%' });
  });
});

describe('CardGridSkeleton', () => {
  test('a card grid skeleton is one element that VoiceOver reads by its label', async () => {
    await render(<CardGridSkeleton accessibilityLabel="Loading collection" />);

    const skeleton = screen.getByRole('progressbar', { name: 'Loading collection' });
    expect(skeleton).toHaveProp('accessible', true);
    expect(within(skeleton).queryAllByLabelText(/./)).toEqual([]);
  });

  test('a card grid skeleton fills the screen with card tiles three to a row, each a card shape and two short bars', async () => {
    await render(<CardGridSkeleton accessibilityLabel="Loading collection" />);

    const [grid] = screen.getByRole('progressbar').children as ReturnType<typeof screen.getByRole>[];
    const tiles = grid.children as ReturnType<typeof screen.getByRole>[];
    expect(grid).toHaveStyle({ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 });
    expect(tiles).toHaveLength(12);
    tiles.forEach((tile) => {
      expect(tile).toHaveStyle({ width: '33.33%' });
      expect(blocksColored(tile, line)).toBe(3);
    });
    const [card, metaBar, priceBar] = tiles[0].children as ReturnType<typeof screen.getByRole>[];
    expect(card).toHaveStyle({ borderRadius: 8, opacity: 0.45 });
    expect(parseFloat(StyleSheet.flatten(card.props.style).aspectRatio)).toBeCloseTo(488 / 680);
    expect(metaBar).toHaveStyle({ height: 12, width: '60%', alignSelf: 'center' });
    expect(priceBar).toHaveStyle({ height: 12, width: '40%', alignSelf: 'center' });
  });
});

describe('CopyMeta', () => {
  test('a copy meta line shows the set icon in its rarity color, named by the set code, and the collector number in meta text', async () => {
    await render(<CopyMeta setCode="mh3" rarity="rare" setIconUri={mh3Symbol} collectorNumber="136" />);

    const setIcon = screen.getByLabelText('MH3');
    expect(cardImageUri(setIcon)).toBe(mh3Symbol);
    expect(imageTintColor(setIcon)).toBe(processColor('#e2bd5a'));
    expect(screen.queryByText('MH3')).not.toBeOnTheScreen();
    expect(screen.getByText('136')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(screen.queryByText('·')).not.toBeOnTheScreen();
  });

  test('a copy meta line shows the set code when there is no set icon', async () => {
    await render(<CopyMeta setCode="c21" rarity="common" setIconUri={undefined} collectorNumber="263" />);

    expect(screen.getByText('C21')).toHaveStyle({ color: textMuted, fontSize: 12 });
  });

  test('a copy meta line adds the condition after a dim dot, in the same muted text', async () => {
    await render(<CopyMeta setCode="mh3" rarity="common" setIconUri={mh3Symbol} collectorNumber="136" condition="MP" />);

    expect(screen.getByText('·')).toHaveStyle({ color: textDim });
    expect(screen.getByText('MP')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(screen.getByText('MP').parent).toHaveStyle({ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' });
  });

  test('a copy meta line of a protected copy starts with an 11 px shield in the warning color', async () => {
    await render(<CopyMeta setCode="mh3" rarity="common" setIconUri={mh3Symbol} collectorNumber="136" isProtected />);

    const line = screen.getByText('136').parent!;
    expect(symbolNames(line)).toEqual(['shield.fill']);
    expect(symbolSizes(line)).toEqual([11]);
    expect(symbolTintColor(line)).toBe(warning);
    expect(appearsBefore(symbolIn(line), screen.getByLabelText('MH3'))).toBe(true);
  });

  test('a copy meta line of a copy in a deck starts with the deck box symbol, before the protected shield', async () => {
    await render(<CopyMeta setCode="mh3" rarity="common" setIconUri={mh3Symbol} collectorNumber="136" isProtected inDeck />);

    const line = screen.getByText('136').parent!;
    expect(imageSources(line)).toEqual([expect.stringMatching(/assets\/deck-box\.svg$/), mh3Symbol]);
    const [deckBox] = line.children as ReturnType<typeof screen.getByText>[];
    expect(deckBox).toHaveStyle({ width: 11, height: 11 });
    expect(imageTintColor(deckBox!)).toBe(processColor(info));
    expect(appearsBefore(deckBox!, symbolIn(line))).toBe(true);
  });

  test('a copy meta line of a copy in no deck has no deck box symbol', async () => {
    await render(<CopyMeta setCode="mh3" rarity="common" setIconUri={mh3Symbol} collectorNumber="136" />);

    expect(imageSources(screen.getByText('136').parent!)).toEqual([mh3Symbol]);
  });
});

describe('PriceLine', () => {
  test('a price line shows the current price in price text centered', async () => {
    await render(<PriceLine price="$1,635.37" stale={false} />);

    expect(screen.getByText('$1,635.37')).toHaveStyle({ color: textPrice, fontSize: 12, fontWeight: '600' });
    expect(screen.getByText('$1,635.37').parent).toHaveStyle({ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' });
    expect(symbolNames(screen.root!)).toEqual([]);
  });

  test('a stale price line has a clock symbol before the price', async () => {
    await render(<PriceLine price="$36.96" stale />);

    expect(symbolNames(screen.root!)).toEqual(['clock']);
    expect(symbolTintColor(screen.root!)).toBe(textPrice);
    expect(screen.getByText('$36.96')).toHaveStyle({ color: textPrice });
  });

  test('a price line with no current price shows a dim dash', async () => {
    await render(<PriceLine price={undefined} stale={false} />);

    expect(screen.getByText('–')).toHaveStyle({ color: textDim, fontSize: 12 });
  });

  test('a price line in the meta tone takes the meta line color for the price and the clock', async () => {
    await render(<PriceLine price="$1.87" stale tone="meta" />);

    expect(screen.getByText('$1.87')).toHaveStyle({ color: textMuted, fontSize: 12, fontWeight: '600' });
    expect(symbolTintColor(screen.root!)).toBe(textMuted);
  });
});

describe('AccountCard', () => {
  test('an account card shows the sign-in provider in body strong and the email in meta text on the surface', async () => {
    await render(<AccountCard provider="Apple" email="you@example.com" />);

    expect(screen.getByText('Signed in with Apple')).toHaveStyle({ color: white, fontSize: 14, fontWeight: '700' });
    expect(screen.getByText('you@example.com')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(screen.getByText('Signed in with Apple').parent).toHaveStyle({ backgroundColor: surface, borderRadius: 12, padding: 10 });
  });

  test('an account card with no email shows only the provider', async () => {
    await render(<AccountCard provider="Google" email={undefined} />);

    expect(screen.getByText('Signed in with Google')).toBeOnTheScreen();
    expect(screen.queryByText(/@/)).not.toBeOnTheScreen();
  });
});

describe('GalleryCard', () => {
  test('a gallery card shows Gallery, the gallery date, and the download status', async () => {
    await render(<GalleryCard date="12 October 2026" status="Up to date" />);

    expect(screen.getByText('Gallery')).toHaveStyle({ color: white, fontWeight: '700' });
    expect(screen.getByText('12 October 2026')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(screen.getByText('Up to date')).toHaveStyle({ color: textMuted, fontSize: 12 });
  });

  test('a gallery card with no gallery and no status yet shows only Gallery', async () => {
    await render(<GalleryCard date={null} status={null} />);

    expect(screen.getByText('Gallery')).toBeOnTheScreen();
    expect(screen.queryByText(/2026|Up to date|Paused|Downloading/)).not.toBeOnTheScreen();
  });
});

describe('FailureNotice', () => {
  test('a failure notice is an alert named by its message, with a danger mark on the surface', async () => {
    await render(<FailureNotice message="Sign-in did not work." />);

    const notice = screen.getByRole('alert', { name: 'Sign-in did not work.' });
    expect(notice).toHaveStyle({ backgroundColor: surface, borderRadius: 12 });
    expect(screen.getByText('!')).toHaveStyle({ color: 'rgba(255, 122, 112, 1)' });
    expect(screen.getByText('!').parent).toHaveStyle({ width: 22, height: 22, borderRadius: 999 });
  });

  test('a long failure message takes the width beside the danger mark and wraps inside the notice', async () => {
    await render(<FailureNotice message="Could not add to your collection. Your scans are kept." />);

    expect(screen.getByText('Could not add to your collection. Your scans are kept.')).toHaveStyle({
      flexGrow: 1,
      flexShrink: 1,
    });
  });

  test('the danger mark lines up with the first line of a long failure message', async () => {
    await render(<FailureNotice message="Could not add to your collection. Your scans are kept." />);

    expect(screen.getByRole('alert')).toHaveStyle({ alignItems: 'baseline' });
  });
});

describe('Brand', () => {
  test('the brand shows the lime outlined brand mark beside mtgscan in brand type', async () => {
    await render(<Brand />);

    const name = screen.getByText('mtgscan');
    expect(name).toHaveStyle({ color: white, fontSize: 22, fontWeight: '800' });
    expect(name.parent?.children[0]).toHaveStyle({ width: 18, height: 25, borderWidth: 2.5, borderColor: lime, borderRadius: 4 });
  });
});

describe('BatchButton', () => {
  test('the batch button shows how many copies are in the scan batch in a count badge', async () => {
    const onPress = jest.fn();
    await render(<BatchButton count={3} onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Scan batch, 3' });
    expect(button).toHaveStyle({ width: 38, height: 38, borderRadius: 999 });
    expect(glassEffect(backdropOf(button))).toBeNull();
    expect(backdropOf(button)).toHaveStyle({ backgroundColor: surfaceControl, borderRadius: 999 });
    expect(touchTarget(button)).toEqual({ width: 44, height: 44 });
    expect(screen.getByText('3')).toBeOnTheScreen();
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('an empty scan batch shows the batch button with no count badge', async () => {
    await render(<BatchButton count={0} onPress={() => {}} />);

    expect(screen.getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();
    expect(screen.queryByText('0')).not.toBeOnTheScreen();
  });

  test('on Liquid Glass, the batch button is round regular glass with no tint that reacts to touch', async () => {
    liquidGlassIsAvailable();
    await render(<BatchButton count={3} onPress={() => {}} />);

    const button = screen.getByRole('button', { name: 'Scan batch, 3' });
    expect(glassEffect(backdropOf(button))).toEqual({ style: 'regular', interactive: true, tintColor: undefined });
    expect(backdropOf(button)).toHaveStyle({ borderRadius: 999 });
    expect(screen.getByText('3')).toBeOnTheScreen();
  });
});

describe('PullIndicator', () => {
  test('a pull indicator is a pill on the control surface with its symbol and label', async () => {
    await render(<PullIndicator label="Pull to add 3 cards" kind="pull" />);

    const label = screen.getByText('Pull to add 3 cards');
    expect(label).toHaveStyle({ color: white, fontSize: 14, fontWeight: '700' });
    expect(glassEffect(backdropOf(label))).toBeNull();
    expect(backdropOf(label)).toHaveStyle({ backgroundColor: surfaceControl, height: 38, borderRadius: 999 });
    expect(symbolNames(backdropOf(label))).toEqual(['arrow.down']);
  });

  test('a pull indicator ready to release shows a plus', async () => {
    await render(<PullIndicator label="Release to add 3 cards" kind="release" />);

    expect(symbolNames(backdropOf(screen.getByText('Release to add 3 cards')))).toEqual(['plus']);
  });

  test('an adding pull indicator shows a spinner in place of its symbol', async () => {
    await render(<PullIndicator label="Adding 3 cards" kind="adding" />);

    const pill = backdropOf(screen.getByText('Adding 3 cards'));
    expect(symbolNames(pill)).toEqual([]);
    expect(showsSpinner(pill)).toBe(true);
  });

  test('a failed pull indicator shows the danger mark in place of its symbol', async () => {
    await render(<PullIndicator label="Failed to add" kind="failed" />);

    const pill = backdropOf(screen.getByText('Failed to add'));
    expect(symbolNames(pill)).toEqual([]);
    expect(screen.getByText('!')).toHaveStyle({ color: 'rgba(255, 122, 112, 1)' });
    expect(screen.getByText('!').parent).toHaveStyle({ width: 22, height: 22, borderRadius: 999 });
  });

  test('on Liquid Glass, a pull indicator is regular glass with no tint that does not react to touch', async () => {
    liquidGlassIsAvailable();
    await render(<PullIndicator label="Release to add 3 cards" kind="release" />);

    const pill = backdropOf(screen.getByText('Release to add 3 cards'));
    expect(glassEffect(pill)).toEqual({ style: 'regular', interactive: false, tintColor: undefined });
    expect(pill).toHaveStyle({ height: 38, borderRadius: 999 });
  });
});

describe('SwipeToConfirm', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('a swipe to confirm is a lime pill button with its label in on-primary and a round handle', async () => {
    await render(<SwipeToConfirm label="Add to collection" onConfirm={async () => true} />);

    const control = screen.getByRole('button', { name: 'Add to collection' });
    expect(control).toHaveStyle({ backgroundColor: lime, borderRadius: 999, height: 52 });
    expect(screen.getByText('Add to collection')).toHaveStyle({ color: onPrimary, fontSize: 14, fontWeight: '700' });
    expect(symbolNames(control)).toEqual(['arrow.right']);
  });

  test('swiping the handle past the threshold confirms once, with a light haptic', async () => {
    const onConfirm = jest.fn(async () => true);
    await render(<SwipeToConfirm label="Add to collection" onConfirm={onConfirm} />);

    await swipeRight(screen.getByRole('button', { name: 'Add to collection' }), 0.9);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(scanFeedback()).toEqual(['light impact']);
  });

  test('releasing the handle before the threshold confirms nothing', async () => {
    const onConfirm = jest.fn(async () => true);
    await render(<SwipeToConfirm label="Add to collection" onConfirm={onConfirm} />);

    await swipeRight(screen.getByRole('button', { name: 'Add to collection' }), 0.5);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(scanFeedback()).toEqual([]);
  });

  test('a disabled swipe to confirm is dimmed and cannot be swiped or activated', async () => {
    const onConfirm = jest.fn(async () => true);
    await render(<SwipeToConfirm label="Add to collection" disabled onConfirm={onConfirm} />);

    const control = screen.getByRole('button', { name: 'Add to collection' });
    expect(control).toBeDisabled();
    expect(control).toHaveStyle({ opacity: expect.closeTo(0.38) });
    await swipeRight(control, 0.9);
    await fireEvent(control, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('a busy swipe to confirm shows a spinner on the handle, keeps its full color, and cannot be swiped', async () => {
    const onConfirm = jest.fn(async () => true);
    await render(<SwipeToConfirm label="Add to collection" busy onConfirm={onConfirm} />);

    const control = screen.getByRole('button', { name: 'Add to collection' });
    expect(control).toBeBusy();
    expect(opacityOf(control)).toBe(1);
    expect(showsSpinner(control)).toBe(true);
    await swipeRight(control, 0.9);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('the handle springs back after a swipe that stops before the threshold', async () => {
    await render(<SwipeToConfirm label="Add to collection" onConfirm={async () => true} />);
    const control = screen.getByRole('button', { name: 'Add to collection' });

    await swipeRight(control, 0.5);
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(swipeHandlePosition(control)).toBeCloseTo(0);
  });

  test('the handle stays at the end while busy and after the action works', async () => {
    let finish = (_worked: boolean) => {};
    function SuccessfulCommit() {
      const [busy, setBusy] = useState(false);
      const [added, setAdded] = useState(false);
      return (
        <>
          <SwipeToConfirm
            label="Add to collection"
            busy={busy}
            disabled={added}
            onConfirm={() => {
              setBusy(true);
              return new Promise((resolve) => {
                finish = resolve;
              });
            }}
          />
          <Button
            onPress={() => {
              setBusy(false);
              setAdded(true);
              finish(true);
            }}>
            <Text>Succeed</Text>
          </Button>
        </>
      );
    }
    await render(<SuccessfulCommit />);
    const control = screen.getByRole('button', { name: 'Add to collection' });

    await swipeRight(control, 0.9);
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(swipeHandlePosition(control)).toBeCloseTo(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Succeed' }));
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(swipeHandleMovesAfterRelease(control)).toEqual([1]);
    expect(showsSpinner(control)).toBe(true);
    expect(opacityOf(control)).toBe(1);
  });

  test('the handle stays at the end from the release until the action ends', async () => {
    let finish = (_worked: boolean) => {};
    await render(
      <SwipeToConfirm
        label="Add to collection"
        onConfirm={() =>
          new Promise((resolve) => {
            finish = resolve;
          })
        }
      />,
    );
    const control = screen.getByRole('button', { name: 'Add to collection' });

    await swipeRight(control, 0.9);
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(swipeHandlePosition(control)).toBeCloseTo(1);
    expect(showsSpinner(control)).toBe(true);
    await act(async () => finish(false));
  });

  test('the handle goes back to the start after the action fails, and the control reads Try again', async () => {
    let finish = (_worked: boolean) => {};
    function FailingCommit() {
      const [busy, setBusy] = useState(false);
      const [failed, setFailed] = useState(false);
      return (
        <>
          <SwipeToConfirm
            label={failed ? 'Try again' : 'Add to collection'}
            busy={busy}
            onConfirm={() => {
              setBusy(true);
              return new Promise((resolve) => {
                finish = resolve;
              });
            }}
          />
          <Button
            onPress={() => {
              setBusy(false);
              setFailed(true);
              finish(false);
            }}>
            <Text>Fail</Text>
          </Button>
        </>
      );
    }
    await render(<FailingCommit />);

    await swipeRight(screen.getByRole('button', { name: 'Add to collection' }), 0.9);
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(swipeHandlePosition(screen.getByRole('button', { name: 'Add to collection' }))).toBeCloseTo(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Fail' }));
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(swipeHandlePosition(retry)).toBeCloseTo(0);
    expect(showsSpinner(retry)).toBe(false);
    expect(retry).toBeEnabled();
  });

  test('a swipe still confirms when the control renders again during the swipe', async () => {
    const confirmed: number[] = [];
    function RenderingScreen() {
      const [renders, setRenders] = useState(0);
      return (
        <>
          <SwipeToConfirm
            label="Add to collection"
            onConfirm={async () => {
              confirmed.push(renders);
              return true;
            }}
          />
          <Button onPress={() => setRenders(renders + 1)}>
            <Text>Render again</Text>
          </Button>
        </>
      );
    }
    await render(<RenderingScreen />);

    const swipe = await beginSwipe(screen.getByRole('button', { name: 'Add to collection' }));
    await swipe.moveTo(0.5);
    await fireEvent.press(screen.getByRole('button', { name: 'Render again' }));
    await swipe.moveTo(0.9);
    await swipe.release();

    expect(confirmed).toEqual([1]);
    expect(scanFeedback()).toEqual(['light impact']);
  });

  test('the VoiceOver default action confirms without a swipe', async () => {
    const onConfirm = jest.fn(async () => true);
    await render(<SwipeToConfirm label="Add to collection" onConfirm={onConfirm} />);

    await fireEvent(screen.getByRole('button', { name: 'Add to collection' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyState', () => {
  test('an empty state shows its illustration, a white title in sheet title type, and a muted message', async () => {
    await render(<EmptyState illustration={<Text>Illustration</Text>} title="No decks yet" message="Create a deck, then add cards to it from your collection." />);

    expect(screen.getByText('Illustration', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('No decks yet')).toHaveStyle({ color: white, fontSize: 17, fontWeight: '800', textAlign: 'center' });
    expect(screen.getByText('Create a deck, then add cards to it from your collection.')).toHaveStyle({ color: textMuted, fontSize: 14, textAlign: 'center' });
  });

  test('VoiceOver reads an empty state as its title and message and skips the illustration', async () => {
    await render(<EmptyState illustration={<Text>Illustration</Text>} title="No decks yet" message="Create a deck, then add cards to it from your collection." />);

    expect(screen.getByLabelText('No decks yet, Create a deck, then add cards to it from your collection.')).toHaveProp('accessible', true);
    expect(isHiddenFromAccessibility(screen.getByText('Illustration', { includeHiddenElements: true }))).toBe(true);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  test('an empty state action is a primary button that VoiceOver reads by its label', async () => {
    const onPress = jest.fn();
    await render(
      <EmptyState
        illustration={null}
        title="Your collection is empty"
        message="Scan cards to add them to your collection."
        action={{ label: 'Scan cards', onPress }}
      />,
    );

    const action = screen.getByRole('button', { name: 'Scan cards' });
    expect(action).toHaveStyle({ backgroundColor: lime });
    expect(screen.getByText('Scan cards')).toHaveStyle({ color: onPrimary });
    expect(touchTarget(action).height).toBeGreaterThanOrEqual(44);
    await fireEvent.press(action);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('empty state illustrations', () => {
  test('empty binder slots are dashed card shapes in line color, three to a row, fading down', async () => {
    await render(<EmptyBinderSlots rows={2} />);

    expect(dashedOutlinesColored(screen.root!, line)).toBe(6);
    expect(blocksColored(screen.root!, line)).toBe(0);
    expect(fadesDown(screen.root!)).toBe(true);
  });

  test('ghost Needs you items and a ghost commander card are line-colored shapes that fade down', async () => {
    await render(<GhostNeedsYouItems />);
    expect(blocksColored(screen.root!, line)).toBeGreaterThan(0);
    expect(fadesDown(screen.root!)).toBe(true);

    await render(<GhostCommanderCard />);
    expect(dashedOutlinesColored(screen.root!, line)).toBe(1);
    expect(fadesDown(screen.root!)).toBe(true);
  });

  test('a dashed card frame holds its symbol, and it and the ghost batch rows do not fade', async () => {
    await render(
      <View>
        <DashedCardFrame symbol="video.slash" />
      </View>,
    );
    expect(dashedOutlinesColored(screen.root!, line)).toBe(1);
    expect(symbolNames(screen.root!)).toEqual(['video.slash']);
    expect(fadesDown(screen.root!)).toBe(false);

    await render(<GhostBatchRows />);
    expect(blocksColored(screen.root!, surface)).toBe(3);
    expect(fadesDown(screen.root!)).toBe(false);
  });
});

const partnerCommanders = [
  { copy_id: 'atraxa', name: 'Atraxa', art_crop_uri: 'https://cards.scryfall.io/art_crop/front/atraxa.jpg' },
  { copy_id: 'kinnan', name: 'Kinnan', art_crop_uri: 'https://cards.scryfall.io/art_crop/front/kinnan.jpg' },
];

describe('CommanderGalleryCard', () => {
  test('a commander gallery card with no commander is a 140 px ghost card with the name in card title type and its chips', async () => {
    await render(<CommanderGalleryCard name="Atraxa" chips={[{ label: 'Medium priority' }, { label: '62 cards' }]} commanders={[]} onPress={() => {}} />);

    const title = screen.getByRole('header', { name: 'Atraxa' });
    expect(title).toHaveStyle({ color: white, fontSize: 20, fontWeight: '800' });
    expect(title.parent).toHaveStyle({ height: 140, backgroundColor: surface, borderRadius: 12, borderStyle: 'dashed', borderColor: line });
    expect(screen.getByLabelText('Medium priority')).toBeOnTheScreen();
    expect(screen.getByLabelText('62 cards')).toBeOnTheScreen();
  });

  test('a commander gallery card is one button named by the deck and its chips', async () => {
    const onPress = jest.fn();
    await render(<CommanderGalleryCard name="Atraxa" chips={[{ label: 'High priority' }, { label: '1 card' }]} commanders={[]} onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Atraxa, High priority, 1 card' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('a commander gallery card shows a status chip with its symbol, and reads it as part of its one button', async () => {
    await render(
      <CommanderGalleryCard
        name="Kinnan"
        chips={[{ label: 'Medium priority' }, { label: '87 cards' }, { label: 'Invalid', tone: 'danger', symbol: 'nosign' }]}
        commanders={[]}
        onPress={() => {}}
      />,
    );

    const card = screen.getByRole('button', { name: 'Kinnan, Medium priority, 87 cards, Invalid' });
    expect(within(card).getByText('Invalid')).toHaveStyle({ color: danger });
    expect(symbolNames(card)).toEqual(['nosign']);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  test('a commander gallery card shows the first commander as art under a fade, and the second as a 40 px avatar at the top right', async () => {
    await render(<CommanderGalleryCard name="Atraxa" chips={[{ label: 'High priority' }, { label: '2 cards' }]} commanders={partnerCommanders} onPress={() => {}} />);

    const frame = screen.getByRole('header', { name: 'Atraxa' }).parent!;
    expect(imageFrames(frame)).toEqual([
      { uri: 'https://cards.scryfall.io/art_crop/front/atraxa.jpg', width: undefined },
      { uri: 'https://cards.scryfall.io/art_crop/front/kinnan.jpg', width: 40 },
    ]);
    expect(fadesDown(frame)).toBe(true);
    expect(frame).not.toHaveStyle({ borderStyle: 'dashed' });
  });
});

describe('DeckBanner', () => {
  test('a deck banner with no commander is a full-width ghost banner with square corners, and its name and chips sit in the 200 px under the safe area', async () => {
    await render(<DeckBanner name="Atraxa" chips={[{ label: 'Medium priority' }, { label: '62 cards' }]} commanders={[]} />);

    const title = screen.getByRole('header', { name: 'Atraxa' });
    expect(title).toHaveStyle({ color: white, fontSize: 20, fontWeight: '800' });
    expect(screen.root).toHaveStyle({ width: '100%', backgroundColor: surface, borderStyle: 'dashed', borderColor: line });
    expect(StyleSheet.flatten(screen.root!.props.style).borderRadius).toBeUndefined();
    expect(heightsAround(title)).toEqual([200]);
    expect(screen.getByLabelText('Medium priority')).toBeOnTheScreen();
    expect(screen.getByLabelText('62 cards')).toBeOnTheScreen();
  });

  test('a deck banner shows its status chip buttons after its chips, in a row that wraps', async () => {
    const onPress = jest.fn();
    await render(
      <DeckBanner
        name="Kinnan"
        chips={[{ label: 'Medium priority' }, { label: '87 cards' }]}
        chipButtons={[{ label: 'Invalid', tone: 'danger', symbol: 'nosign', accessibilityLabel: 'Deck validity, Invalid', onPress }]}
        commanders={[]}
      />,
    );

    const chip = screen.getByRole('button', { name: 'Deck validity, Invalid' });
    await fireEvent.press(chip);

    expect(appearsBefore(screen.getByLabelText('87 cards'), chip)).toBe(true);
    expect(chip.parent).toHaveStyle({ flexWrap: 'wrap' });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('a deck banner shows the first commander as art under a fade, and the second as a 48 px avatar', async () => {
    await render(<DeckBanner name="Atraxa" chips={[{ label: 'High priority' }, { label: '2 cards' }]} commanders={partnerCommanders} />);

    expect(imageFrames(screen.root!)).toEqual([
      { uri: 'https://cards.scryfall.io/art_crop/front/atraxa.jpg', width: undefined },
      { uri: 'https://cards.scryfall.io/art_crop/front/kinnan.jpg', width: 48 },
    ]);
    expect(fadesDown(screen.root!)).toBe(true);
    expect(screen.root).not.toHaveStyle({ borderStyle: 'dashed' });
  });
});

describe('SortButton', () => {
  const sorts = [
    { sort: 'relevance', title: 'Relevance' },
    { sort: 'price', title: 'Price' },
  ] as const;

  test('a sort button is the arrow.up.arrow.down floating menu button with a "Sort by" menu, and VoiceOver reads "Sort" and the order', async () => {
    await render(<SortButton sorts={[...sorts]} order={{ sort: 'relevance' }} spokenOrder="Relevance" active={false} onSelect={() => {}} />);

    const button = menuButton(screen.container, 'Sort, Relevance');
    expect(symbolNames(button)).toEqual(['arrow.up.arrow.down']);
    expect(symbolTintColor(button)).toBe(white);
    expect(buttonMenu(button)).toEqual({
      title: 'Sort by',
      items: [
        { title: 'Relevance', checked: true, symbol: undefined },
        { title: 'Price', checked: false, symbol: undefined },
      ],
    });
  });

  test('the current sort has an arrow for its direction, an active sort button is lime, and a choice runs with its sort', async () => {
    const onSelect = jest.fn();
    await render(
      <SortButton
        sorts={[...sorts]}
        order={{ sort: 'price', direction: 'asc' }}
        spokenOrder="Price, low to high"
        active
        onSelect={onSelect}
      />,
    );

    const button = menuButton(screen.container, 'Sort, Price, low to high');
    expect(symbolTintColor(button)).toBe(lime);
    expect(buttonMenu(button).items[1]).toEqual({ title: 'Price', checked: true, symbol: 'arrow.up' });

    await pressButtonMenuItem(button, 'Price');

    expect(onSelect).toHaveBeenCalledWith('price');
  });
});

describe('GroupButton', () => {
  const groupings = [
    { grouping: 'type', title: 'Type' },
    { grouping: 'rarity', title: 'Rarity' },
  ] as const;

  test('a group button is the rectangle.3.group floating menu button with a "Group by" menu, and VoiceOver reads "Group" and the grouping', async () => {
    await render(<GroupButton groupings={[...groupings]} grouping="type" active={false} onSelect={() => {}} />);

    const button = menuButton(screen.container, 'Group, Type');
    expect(symbolNames(button)).toEqual(['rectangle.3.group']);
    expect(symbolTintColor(button)).toBe(white);
    expect(buttonMenu(button)).toEqual({
      title: 'Group by',
      items: [
        { title: 'Type', checked: true, symbol: undefined },
        { title: 'Rarity', checked: false, symbol: undefined },
      ],
    });
  });

  test('an active group button is lime, and a choice runs with its grouping', async () => {
    const onSelect = jest.fn();
    await render(<GroupButton groupings={[...groupings]} grouping="rarity" active onSelect={onSelect} />);

    const button = menuButton(screen.container, 'Group, Rarity');
    expect(symbolTintColor(button)).toBe(lime);

    await pressButtonMenuItem(button, 'Type');

    expect(onSelect).toHaveBeenCalledWith('type');
  });
});
