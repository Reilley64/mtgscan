import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { useState } from 'react';
import { processColor, View } from 'react-native';

import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { QuickActionButton } from '@/components/atoms/quick-action-button';
import { Text } from '@/components/atoms/text';
import { AccountCard } from '@/components/molecules/account-card';
import { BatchButton } from '@/components/molecules/batch-button';
import { Brand } from '@/components/molecules/brand';
import { CardGrid } from '@/components/molecules/card-grid';
import { CardTile } from '@/components/molecules/card-tile';
import { ChipGroup } from '@/components/molecules/chip-group';
import { CopyMeta } from '@/components/molecules/copy-meta';
import { PriceLine } from '@/components/molecules/price-line';
import { PullIndicator } from '@/components/molecules/pull-indicator';
import { FailureNotice } from '@/components/molecules/failure-notice';
import { GalleryCard } from '@/components/molecules/gallery-card';
import { ListRow } from '@/components/molecules/list-row';
import { QuickActionBar } from '@/components/molecules/quick-action-bar';
import { SheetSection } from '@/components/molecules/sheet-section';
import { SwitchRow } from '@/components/molecules/switch-row';
import { ThumbnailChip } from '@/components/molecules/thumbnail-chip';
import { ToggleGroup } from '@/components/molecules/toggle-group';

import { liquidGlassIsAvailable } from './fake-glass-effect';
import {
  backdropOf,
  cardImageOutline,
  cardImageUri,
  cardSheen,
  glassEffect,
  imageTintColor,
  showsSpinner,
  sideColumnWidths,
  symbolNames,
  touchTarget,
} from './native-ui';
import { tokenColors } from './token-colors';

const { primary: lime, onPrimary, surface, surfaceControl, line, text: white, textMuted, textDim, textPrice } = tokenColors;
const solRing = 'https://cards.scryfall.io/normal/front/sol-ring.jpg';
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

  test('a list row with only a title has a 44 pt touch target', async () => {
    await render(<ListRow title="Lightning Bolt" onPress={() => {}} />);

    expect(touchTarget(screen.getByRole('button', { name: 'Lightning Bolt' })).height).toBeGreaterThanOrEqual(44);
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

  test('card tiles sit three to a row', async () => {
    await render(
      <CardGrid>
        <CardTile uri={solRing} caption="CMM 464" accessibilityLabel="Sol Ring, CMM 464" />
      </CardGrid>,
    );

    expect(screen.getByRole('image', { name: 'Sol Ring, CMM 464' }).parent).toHaveStyle({ width: '33.33%' });
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
    expect(screen.getByText('$36.96')).toHaveStyle({ color: textPrice });
  });

  test('a price line with no current price shows a dim dash', async () => {
    await render(<PriceLine price={undefined} stale={false} />);

    expect(screen.getByText('–')).toHaveStyle({ color: textDim, fontSize: 12 });
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
