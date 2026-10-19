import type { ErrorCodeOf, Refusal, RequestOf } from '@mtgscan/supabase/database-function';
import type { databaseFunctions } from '@mtgscan/supabase/database-functions';
import { act } from 'expo-router/testing-library';

export type FunctionName = keyof typeof databaseFunctions;

export type Contract<Name extends FunctionName> = (typeof databaseFunctions)[Name];

export type ArgumentKey = NonNullable<Contract<FunctionName>['argument']>;

type CallName = FunctionName | 'training-crops' | 'oauth.listGrants' | 'oauth.revokeGrant' | 'gallery.download' | 'card_sets.lookup';

type Call = { name: CallName; request: unknown };

type Failure = { names: CallName[]; left: number; when: 'before the server answers' | 'after the server answers' };

type Hold = { names: CallName[]; once: boolean; released: Promise<void> };

export class Refused<Code extends string> implements Refusal<Code> {
  constructor(
    readonly code: Code,
    readonly message: string,
    readonly field: string | null,
  ) {}
}

let calls: Call[] = [];
let failures: Failure[] = [];
let holds: Hold[] = [];
let refusals: { name: FunctionName; refused: Refused<string> }[] = [];

export function resetControls() {
  calls = [];
  failures = [];
  holds = [];
  refusals = [];
}

function listOf(names: CallName | readonly CallName[]) {
  return typeof names === 'string' ? [names] : [...names];
}

export function fail(names: CallName | readonly CallName[], count = 1, when: Failure['when'] = 'before the server answers') {
  failures = [...failures, { names: listOf(names), left: count, when }];
}

export function refuse<Name extends FunctionName>(name: Name, code: ErrorCodeOf<Contract<Name>>, field: string) {
  refusals = [...refusals, { name, refused: new Refused(code, `${field} is refused with ${code}.`, field) }];
}

export function hold(names: CallName | readonly CallName[], { once = false } = {}) {
  let release = () => {};
  const held: Hold = { names: listOf(names), once, released: new Promise((resolve) => (release = resolve)) };
  holds = [...holds, held];
  return {
    finish: async () => {
      holds = holds.filter((candidate) => candidate !== held);
      await act(async () => release());
    },
  };
}

export function callsSent(names: CallName | readonly CallName[]) {
  const wanted = listOf(names);
  return calls.filter((call) => wanted.includes(call.name));
}

export function requestsSent<Name extends FunctionName>(name: Name) {
  return callsSent(name).map((call) => call.request as RequestOf<Contract<Name>>);
}

export function takeRefusal(name: FunctionName) {
  const refusal = refusals.find((candidate) => candidate.name === name);
  refusals = refusals.filter((candidate) => candidate !== refusal);
  return refusal?.refused;
}

function takeHold(name: CallName) {
  const held = holds.findLast((candidate) => candidate.names.includes(name));
  if (held?.once) {
    holds = holds.filter((candidate) => candidate !== held);
  }
  return held?.released;
}

function takeFailure(name: CallName) {
  const failure = failures.find((candidate) => candidate.left > 0 && candidate.names.includes(name));
  if (failure) {
    failure.left -= 1;
  }
  return failure;
}

export async function controlled<Answer, Failed>(name: CallName, request: unknown, answer: () => Answer, failed: Failed) {
  calls = [...calls, { name, request }];
  const held = takeHold(name);
  if (held) {
    await held;
  }
  const failure = takeFailure(name);
  if (failure?.when === 'before the server answers') {
    return failed;
  }
  const answered = answer();
  return failure ? failed : answered;
}
