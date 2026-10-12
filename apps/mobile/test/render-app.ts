import { act, renderRouter } from 'expo-router/testing-library';

export async function renderApp(initialUrl?: string) {
  await renderRouter('src/app', { initialUrl });
  await act(async () => {});
}
