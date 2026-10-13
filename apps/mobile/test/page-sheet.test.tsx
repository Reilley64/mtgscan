import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { PageSheet } from '@/components/templates/page-sheet';

import { isInScrollView } from './native-ui';
import { tokenColors } from './token-colors';

test('a page sheet keeps its title, Done, and footer outside the content that scrolls', async () => {
  const onDone = jest.fn();
  await render(
    <PageSheet
      title="Scan batch"
      onDone={onDone}
      footer={
        <Button variant="primary" onPress={() => {}}>
          <Text>Add 2 to collection</Text>
        </Button>
      }>
      <Text>Lightning Bolt</Text>
    </PageSheet>,
  );

  const title = screen.getByRole('header', { name: 'Scan batch' });
  expect(title).toHaveStyle({ fontSize: 17, fontWeight: '800' });
  expect(isInScrollView(title)).toBe(false);
  expect(isInScrollView(screen.getByRole('button', { name: 'Add 2 to collection' }))).toBe(false);
  expect(isInScrollView(screen.getByText('Lightning Bolt'))).toBe(true);

  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(onDone).toHaveBeenCalledTimes(1);
});

test('a page sheet fills the sheet color', async () => {
  await render(
    <PageSheet title="Scan batch" onDone={() => {}} footer={null}>
      <Text>Lightning Bolt</Text>
    </PageSheet>,
  );

  expect(screen.getByRole('header', { name: 'Scan batch' }).parent?.parent).toHaveStyle({
    backgroundColor: tokenColors.sheet,
  });
});
