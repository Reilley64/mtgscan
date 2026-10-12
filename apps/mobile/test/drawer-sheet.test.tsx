import { render, screen } from '@testing-library/react-native';

import { Text } from '@/components/atoms/text';
import { DrawerSheet } from '@/components/templates/drawer-sheet';

import { isInScrollView } from './native-ui';

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
