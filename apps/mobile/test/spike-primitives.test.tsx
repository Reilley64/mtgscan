import { fireEvent, screen } from 'expo-router/testing-library';

import { startSignedIn } from './fake-supabase';
import { openSettings } from './native-ui';
import { renderApp } from './render-app';

beforeEach(() => {
  startSignedIn();
});

test('the spike toggle in settings turns on when pressed and off when pressed again', async () => {
  await renderApp();
  await openSettings();

  const toggle = screen.getByRole('switch', { name: 'Spike toggle' });
  expect(toggle).not.toBeChecked();

  await fireEvent.press(toggle);
  expect(screen.getByRole('switch', { name: 'Spike toggle' })).toBeChecked();

  await fireEvent.press(screen.getByRole('switch', { name: 'Spike toggle' }));
  expect(screen.getByRole('switch', { name: 'Spike toggle' })).not.toBeChecked();
});
