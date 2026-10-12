import { fireEvent, screen } from 'expo-router/testing-library';

import { startSignedIn } from './fake-supabase';
import { openSettings } from './native-ui';
import { renderApp } from './render-app';

beforeEach(() => {
  startSignedIn();
});

const surfaceControl = 'rgba(35, 44, 49, 1)';
const primary = 'rgba(216, 255, 98, 1)';

test('the spike toggle in settings turns on when pressed and off when pressed again', async () => {
  await renderApp();
  await openSettings();

  const toggle = screen.getByRole('switch', { name: 'Spike toggle' });
  expect(toggle).not.toBeChecked();
  expect(toggle).toHaveStyle({ backgroundColor: surfaceControl, height: 38, borderRadius: 8 });

  await fireEvent.press(toggle);
  expect(screen.getByRole('switch', { name: 'Spike toggle' })).toBeChecked();
  expect(screen.getByRole('switch', { name: 'Spike toggle' })).toHaveStyle({ backgroundColor: primary });

  await fireEvent.press(screen.getByRole('switch', { name: 'Spike toggle' }));
  expect(screen.getByRole('switch', { name: 'Spike toggle' })).not.toBeChecked();
  expect(screen.getByRole('switch', { name: 'Spike toggle' })).toHaveStyle({ backgroundColor: surfaceControl });
});

test('the sign out button in settings is a secondary button with a bold white label', async () => {
  await renderApp();
  await openSettings();

  expect(screen.getByRole('button', { name: 'Sign out' })).toHaveStyle({
    backgroundColor: surfaceControl,
    height: 38,
    borderRadius: 8,
  });
  expect(screen.getByText('Sign out')).toHaveStyle({ color: 'rgba(255, 255, 255, 1)', fontSize: 14, fontWeight: '700' });
});
