import type { Refusal } from '../../database-function.ts';

export const problemTypeBase = 'https://mtgscan.reilley.dev/problems/';

export const internalErrorDetail = 'Something went wrong in mtgscan. Try again.';

export const problemKinds = {
  'invalid-argument': { title: 'Invalid argument', retryable: false },
  'invalid-cursor': { title: 'Invalid cursor', retryable: false },
  'not-found': { title: 'Not found', retryable: false },
  'invalid-card': { title: 'Invalid card', retryable: false },
  'stale-revision': { title: 'Stale revision', retryable: false },
  'outgoing-not-in-deck': { title: 'Outgoing card not in deck', retryable: false },
  'copy-not-free': { title: 'Copy not free', retryable: false },
  'protected-copy': { title: 'Protected copy', retryable: false },
  'duplicate-open': { title: 'Duplicate open', retryable: false },
  'free-copy-exists': { title: 'Free copy exists', retryable: false },
  'not-open': { title: 'Not open', retryable: false },
  'user-tag-exists': { title: 'User tag exists', retryable: false },
  'idempotency-conflict': { title: 'Idempotency conflict', retryable: false },
  'data-unavailable': { title: 'Data unavailable', retryable: true },
  'result-too-large': { title: 'Result too large', retryable: false },
  'rate-limited': { title: 'Rate limited', retryable: true },
  'internal-error': { title: 'Internal error', retryable: true },
  unauthorized: { title: 'Unauthorized', retryable: false },
  'request-too-large': { title: 'Request too large', retryable: false },
} as const;

export type ProblemName = keyof typeof problemKinds;

type CodeOf<Name extends string> = Name extends `${infer Head}-${infer Tail}` ? `${Head}_${CodeOf<Tail>}` : Name;

export type ProblemCode = CodeOf<ProblemName>;

export const beginMcpCallCodes = ['rate_limited', 'unauthorized'] as const satisfies readonly ProblemCode[];

const reservedMembers = new Set(['type', 'title', 'detail', 'retryable', 'status']);

export type Problem = {
  type: string;
  title: string;
  detail: string;
  pointer?: string;
  retryable: boolean;
  [member: string]: unknown;
};

export const problemSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', format: 'uri' },
    title: { type: 'string' },
    detail: { type: 'string' },
    pointer: { type: 'string' },
    retryable: { type: 'boolean' },
    retry_after_seconds: { type: 'integer' },
  },
  required: ['type', 'title', 'detail', 'retryable'],
};

function problemBase(name: ProblemName, detail: string) {
  return { type: problemTypeBase + name, title: problemKinds[name].title, detail };
}

export function problem(name: ProblemName, detail: string, members: Record<string, unknown> = {}): Problem {
  const extraMembers = Object.entries(members).filter(([member]) => !reservedMembers.has(member));
  return { ...problemBase(name, detail), ...Object.fromEntries(extraMembers), retryable: problemKinds[name].retryable };
}

export function httpProblem(name: ProblemName, status: number, detail: string): Response {
  return new Response(JSON.stringify({ ...problemBase(name, detail), status }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

export function nameOf(toolProblem: Problem): ProblemName {
  return toolProblem.type.slice(problemTypeBase.length) as ProblemName;
}

export function refusalProblem({ code, message, field }: Refusal): Problem {
  return problem(code.replaceAll('_', '-') as ProblemName, message, membersOfField(field));
}

function membersOfField(field: string | null): Record<string, unknown> {
  if (!field) {
    return {};
  }
  return jsonObject(field) ?? { pointer: pointerOfField(field) };
}

function jsonObject(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function pointerOfField(field: string): string {
  return field
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((token) => '/' + token.replaceAll('~', '~0').replaceAll('/', '~1'))
    .join('');
}
