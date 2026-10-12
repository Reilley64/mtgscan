import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { ChipGroup } from '@/components/molecules/chip-group';
import { ListRow } from '@/components/molecules/list-row';
import { SwitchRow } from '@/components/molecules/switch-row';
import { ToggleGroup } from '@/components/molecules/toggle-group';

import { touchTarget } from './native-ui';

const lime = 'rgba(216, 255, 98, 1)';
const surface = 'rgba(17, 23, 26, 1)';
const surfaceControl = 'rgba(35, 44, 49, 1)';
const white = 'rgba(255, 255, 255, 1)';
const textMuted = 'rgba(181, 192, 197, 1)';

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
        accessibilityLabel="Card page section"
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

  test('a toggle group is a labelled control surface with the chosen option checked and lime', async () => {
    await render(<CardPageSections />);

    expect(screen.getByLabelText('Card page section')).toHaveStyle({
      backgroundColor: surfaceControl,
      borderRadius: 8,
    });
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
