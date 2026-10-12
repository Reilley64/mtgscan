import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { AccountCard } from '@/components/molecules/account-card';
import { Brand } from '@/components/molecules/brand';
import { CardGrid } from '@/components/molecules/card-grid';
import { CardTile } from '@/components/molecules/card-tile';
import { ChipGroup } from '@/components/molecules/chip-group';
import { FailureNotice } from '@/components/molecules/failure-notice';
import { GalleryCard } from '@/components/molecules/gallery-card';
import { ListRow } from '@/components/molecules/list-row';
import { SwitchRow } from '@/components/molecules/switch-row';
import { ToggleGroup } from '@/components/molecules/toggle-group';

import { cardImageOutline, cardImageUri, touchTarget } from './native-ui';
import { tokenColors } from './token-colors';

const { primary: lime, surface, surfaceControl, text: white, textMuted } = tokenColors;
const solRing = 'https://cards.scryfall.io/normal/front/sol-ring.jpg';
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
    expect(screen.getByRole('radio', { name: 'Copies', checked: true })).toHaveStyle({ backgroundColor: lime });
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

describe('CardTile', () => {
  test('a card tile shows the card image with a muted set and collector number caption', async () => {
    await render(<CardTile uri={solRing} caption="CMM 464" accessibilityLabel="Sol Ring, CMM 464" />);

    const tile = screen.getByRole('image', { name: 'Sol Ring, CMM 464' });
    expect(cardImageUri(tile)).toBe(solRing);
    expect(screen.getByText('CMM 464')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  test('a card tile with a quantity shows it in a round quantity badge', async () => {
    await render(<CardTile uri={solRing} caption="CMM 464" accessibilityLabel="Sol Ring, CMM 464, 2 owned" quantity={2} />);

    expect(screen.getByText('2')).toHaveStyle({ color: white, fontSize: 10, fontWeight: '700' });
    expect(screen.getByText('2').parent).toHaveStyle({ height: 19, minWidth: 19, borderRadius: 999 });
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
});

describe('Brand', () => {
  test('the brand shows the lime outlined brand mark beside mtgscan in brand type', async () => {
    await render(<Brand />);

    const name = screen.getByText('mtgscan');
    expect(name).toHaveStyle({ color: white, fontSize: 22, fontWeight: '800' });
    expect(name.parent?.children[0]).toHaveStyle({ width: 18, height: 25, borderWidth: 2.5, borderColor: lime, borderRadius: 4 });
  });
});
