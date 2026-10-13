import { act, renderRouter, screen } from 'expo-router/testing-library';

export async function renderApp(initialUrl?: string) {
  await renderRouter('src/app', { initialUrl });
  await act(async () => {});
}

export async function restartTheApp() {
  await act(async () => screen.unmount());
  await renderApp();
}
