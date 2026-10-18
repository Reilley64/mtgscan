import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { DrawerSheet } from '@/components/templates/drawer-sheet';

import { appearsBefore, isInScrollView } from './native-ui';

function scrollContentPaddingTop(element: ReturnType<typeof screen.getByText>) {
  let candidate = element.parent;
  while (candidate && candidate.type !== 'RCTScrollView') {
    candidate = candidate.parent;
  }
  return StyleSheet.flatten(candidate?.props.contentContainerStyle)?.paddingTop;
}

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
      title="2 cards scanned"
      footer={
        <Button variant="primary" onPress={() => {}}>
          <Text>Add to collection</Text>
        </Button>
      }>
      <Text>Lightning Bolt</Text>
    </DrawerSheet>,
  );

  const footer = screen.getByRole('button', { name: 'Add to collection' });
  expect(isInScrollView(footer)).toBe(false);
  expect(isInScrollView(screen.getByText('Lightning Bolt'))).toBe(true);
  expect(appearsBefore(screen.getByText('Lightning Bolt'), footer)).toBe(true);
});

test('a drawer sheet starts its content 32 px down to clear the grabber, or 8 px down under a native header', async () => {
  await render(
    <DrawerSheet>
      <Text>Lightning Bolt</Text>
    </DrawerSheet>,
  );
  expect(scrollContentPaddingTop(screen.getByText('Lightning Bolt'))).toBe(32);

  await render(
    <DrawerSheet belowHeader>
      <Text>Counterspell</Text>
    </DrawerSheet>,
  );
  expect(scrollContentPaddingTop(screen.getByText('Counterspell'))).toBe(8);
});
