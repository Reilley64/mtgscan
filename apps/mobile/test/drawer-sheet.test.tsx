import { render, screen } from '@testing-library/react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { DrawerSheet } from '@/components/templates/drawer-sheet';

import { appearsBefore, isInScrollView } from './native-ui';

test('a drawer sheet keeps its title above the content that scrolls', async () => {
  await render(
    <DrawerSheet title="Settings">
      <Text>Gallery</Text>
    </DrawerSheet>,
  );

  const title = screen.getByRole('header', { name: 'Settings' });
  expect(isInScrollView(title)).toBe(false);
  expect(title).toHaveStyle({ fontSize: 17, fontWeight: '800', textAlign: 'center' });
  expect(isInScrollView(screen.getByText('Gallery'))).toBe(true);
});

test('a drawer sheet with no title scrolls all its content', async () => {
  await render(
    <DrawerSheet>
      <Text>Lightning Bolt</Text>
    </DrawerSheet>,
  );

  expect(screen.queryByRole('header')).not.toBeOnTheScreen();
  expect(isInScrollView(screen.getByText('Lightning Bolt'))).toBe(true);
});

test('a drawer sheet keeps its footer below the content that scrolls', async () => {
  await render(
    <DrawerSheet
      title="Scan batch"
      footer={
        <Button variant="primary" onPress={() => {}}>
          <Text>Add 2 to collection</Text>
        </Button>
      }>
      <Text>Lightning Bolt</Text>
    </DrawerSheet>,
  );

  const footer = screen.getByRole('button', { name: 'Add 2 to collection' });
  expect(isInScrollView(footer)).toBe(false);
  expect(isInScrollView(screen.getByText('Lightning Bolt'))).toBe(true);
  expect(appearsBefore(screen.getByText('Lightning Bolt'), footer)).toBe(true);
});
