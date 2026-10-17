import { describe, expect, test } from 'bun:test';

import { asDatabaseOwner, signUpNewUser, type TestUser } from './local-stack';

type Problem = { code: string; message: string; details: string | null };

function requestWith(idempotencyKey: string, items: object[]) {
  return { idempotency_key: idempotencyKey, items };
}

function aiWrite(user: TestUser, request: object, result: object): Promise<unknown> {
  return asDatabaseOwner((database) =>
    database.begin(async (transaction) => {
      const [{ replayed }] = await transaction`select private.replayed_ai_write(${user.userId}, ${request}::jsonb) as replayed`;
      if (replayed !== null) {
        return replayed;
      }
      const [{ saved }] = await transaction`select private.save_ai_write(${user.userId}, ${request}::jsonb, ${result}::jsonb) as saved`;
      return saved;
    }),
  );
}

async function refusalOf(user: TestUser, request: object): Promise<Problem> {
  try {
    await aiWrite(user, request, { replayed: false });
  } catch (error) {
    return JSON.parse((error as Error).message) as Problem;
  }
  throw new Error('The AI write was not refused');
}

function storedKeys(user: TestUser) {
  return asDatabaseOwner(
    (database) => database`
      select idempotency_key from public.ai_write_requests where user_id = ${user.userId} order by idempotency_key
    `,
  );
}

function age(user: TestUser, idempotencyKey: string, interval: string) {
  return asDatabaseOwner(
    (database) => database`
      update public.ai_write_requests set created_at = now() - ${interval}::interval
      where user_id = ${user.userId} and idempotency_key = ${idempotencyKey}
    `,
  );
}

describe('idempotency keys of AI writes', () => {
  test('a repeat with the same idempotency key and input returns the first result with replayed: true', async () => {
    const user = await signUpNewUser();
    const request = requestWith('retried-call', [{ ref: 'first' }]);

    const first = await aiWrite(user, request, { items: ['first result'], replayed: false });
    const repeat = await aiWrite(user, request, { items: ['second result'], replayed: false });

    expect(first).toEqual({ items: ['first result'], replayed: false });
    expect(repeat).toEqual({ items: ['first result'], replayed: true });
  });

  test('a repeat with the same idempotency key and other input is refused with idempotency_conflict', async () => {
    const user = await signUpNewUser();
    await aiWrite(user, requestWith('reused-key', [{ ref: 'first' }]), { replayed: false });

    expect(await refusalOf(user, requestWith('reused-key', [{ ref: 'second' }]))).toMatchObject({
      code: 'idempotency_conflict',
      message: 'idempotency_key was used with different input. Send a new idempotency_key.',
      details: 'idempotency_key',
    });
  });

  test('idempotency keys are per user', async () => {
    const alice = await signUpNewUser();
    const bob = await signUpNewUser();
    await aiWrite(alice, requestWith('shared-key', [{ ref: 'alice' }]), { owner: 'alice', replayed: false });

    expect(await aiWrite(bob, requestWith('shared-key', [{ ref: 'bob' }]), { owner: 'bob', replayed: false })).toEqual({
      owner: 'bob',
      replayed: false,
    });
  });

  test('idempotency keys are kept 24 hours, and older keys are deleted', async () => {
    const user = await signUpNewUser();
    await aiWrite(user, requestWith('old-idempotency-key', [{ ref: 'first' }]), { replayed: false });

    await age(user, 'old-idempotency-key', '23 hours');
    expect(await refusalOf(user, requestWith('old-idempotency-key', [{ ref: 'second' }]))).toMatchObject({ code: 'idempotency_conflict' });
    await age(user, 'old-idempotency-key', '25 hours');
    await aiWrite(await signUpNewUser(), requestWith('other-users-key', [{ ref: 'other' }]), { replayed: false });

    expect(await storedKeys(user)).toEqual([]);
    expect(await aiWrite(user, requestWith('old-idempotency-key', [{ ref: 'second' }]), { replayed: false })).toEqual({ replayed: false });
  });
});
