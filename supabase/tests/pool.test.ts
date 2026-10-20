import { describe, expect, test } from 'bun:test';

import { inPool } from '../gallery/pool';

function tasks(count: number) {
  const started: number[] = [];
  const finishes = Array.from({ length: count }, () => Promise.withResolvers<void>());
  const startedNext = Array.from({ length: count }, () => Promise.withResolvers<void>());
  const run = (item: number) => {
    started.push(item);
    startedNext[item]!.resolve();
    return finishes[item]!.promise;
  };
  return { started, finishes, startedNext, run, items: Array.from({ length: count }, (_, item) => item) };
}

describe('a pool of 8', () => {
  test('starts 8 tasks, then starts the next one as soon as any one finishes', async () => {
    const { started, finishes, startedNext, run, items } = tasks(10);

    const pool = inPool(items, 8, run);
    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    finishes[5]!.resolve();
    await startedNext[8]!.promise;
    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);

    for (const finish of finishes) {
      finish.resolve();
    }
    await pool;
    expect(started).toHaveLength(10);
  });

  test('stops with the error of a failed task and starts no more tasks', async () => {
    const { started, finishes, run, items } = tasks(10);

    const pool = inPool(items, 8, run);
    finishes[0]!.reject(new Error('Could not download'));

    await expect(pool).rejects.toThrow('Could not download');
    for (const finish of finishes) {
      finish.resolve();
    }
    await Bun.sleep(0);
    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
