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
  'idempotency-conflict': { title: 'Idempotency conflict', retryable: false },
  'data-unavailable': { title: 'Data unavailable', retryable: true },
  'result-too-large': { title: 'Result too large', retryable: false },
  'rate-limited': { title: 'Rate limited', retryable: true },
  'internal-error': { title: 'Internal error', retryable: true },
  unauthorized: { title: 'Unauthorized', retryable: false },
  'request-too-large': { title: 'Request too large', retryable: false },
} as const;

export type ProblemName = keyof typeof problemKinds;

const problemOfPostgresCode: Record<string, ProblemName> = {
  invalid_argument: 'invalid-argument',
  invalid_cursor: 'invalid-cursor',
  not_found: 'not-found',
  invalid_card: 'invalid-card',
  stale_revision: 'stale-revision',
  outgoing_not_in_deck: 'outgoing-not-in-deck',
  copy_not_free: 'copy-not-free',
  protected_copy: 'protected-copy',
  duplicate_open: 'duplicate-open',
  free_copy_exists: 'free-copy-exists',
  not_open: 'not-open',
  idempotency_conflict: 'idempotency-conflict',
  data_unavailable: 'data-unavailable',
  rate_limited: 'rate-limited',
  unauthorized: 'unauthorized',
};

const reservedMembers = new Set(['type', 'title', 'detail', 'retryable', 'status']);

export type Problem = {
  type: string;
  title: string;
  detail: string;
  pointer?: string;
  retryable: boolean;
  [member: string]: unknown;
};

export type PostgresError = { code: string; message: string; details: string | null };

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

export function problemFromPostgres(error: PostgresError): Problem {
  const name = problemOfPostgresCode[error.code];
  if (!name) {
    return problem('internal-error', internalErrorDetail);
  }
  return problem(name, error.message, membersOfDetails(error.details));
}

function membersOfDetails(details: string | null): Record<string, unknown> {
  if (!details) {
    return {};
  }
  return jsonObject(details) ?? { pointer: pointerOfField(details) };
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
