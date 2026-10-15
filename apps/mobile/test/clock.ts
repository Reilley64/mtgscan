import { act } from 'expo-router/testing-library';

export function todayIs(time: string) {
  jest.useFakeTimers({
    now: new Date(time),
    doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance'],
  });
}

export async function timePasses(ms: number) {
  await act(async () => jest.setSystemTime(Date.now() + ms));
}
