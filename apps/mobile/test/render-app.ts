import { act, renderRouter } from 'expo-router/testing-library';

export async function renderApp() {
  await renderRouter('src/app');
  await act(async () => {});
}
