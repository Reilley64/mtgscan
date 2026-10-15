import { act } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

async function changeAppState(state: AppStateStatus) {
  const { calls, results } = jest.mocked(AppState.addEventListener).mock;
  const listeners = calls
    .filter(([type], index) => type === 'change' && jest.mocked(results[index]!.value.remove).mock.calls.length === 0)
    .map(([, listener]) => listener);
  await act(async () => {
    listeners.forEach((listener) => listener(state));
  });
}

export async function returnToTheApp() {
  await changeAppState('active');
}

export async function leaveTheApp() {
  await changeAppState('background');
}
