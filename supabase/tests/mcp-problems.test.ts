import { describe, expect, test } from 'bun:test';

import { problemFromPostgres } from '../functions/mcp/problems';

const problems = 'https://mtgscan.reilley.dev/problems/';

describe('problem details from a Postgres error', () => {
  test('a field path in details becomes a JSON Pointer', () => {
    expect(
      problemFromPostgres({ code: 'invalid_argument', message: 'reason is too short.', details: 'suggestions[1].incoming.from_deck_id' }),
    ).toEqual({
      type: `${problems}invalid-argument`,
      title: 'Invalid argument',
      detail: 'reason is too short.',
      pointer: '/suggestions/1/incoming/from_deck_id',
      retryable: false,
    });
  });

  test('a JSON object in details gives the pointer and the members of the problem type', () => {
    expect(
      problemFromPostgres({
        code: 'rate_limited',
        message: 'Wait.',
        details: JSON.stringify({ pointer: '/suggestions/1/expected_deck_revision', expected: 3, current: 4 }),
      }),
    ).toEqual({
      type: `${problems}rate-limited`,
      title: 'Rate limited',
      detail: 'Wait.',
      pointer: '/suggestions/1/expected_deck_revision',
      expected: 3,
      current: 4,
      retryable: true,
    });
  });

  test('a code with no entry is internal-error and keeps the message out', () => {
    expect(problemFromPostgres({ code: '42501', message: 'permission denied for table decks', details: null })).toEqual({
      type: `${problems}internal-error`,
      title: 'Internal error',
      detail: 'Something went wrong in mtgscan. Try again.',
      retryable: true,
    });
  });
});
