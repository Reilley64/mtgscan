export const problemTypeBase = 'https://mtgscan.reilley.dev/problems/';

const problemKinds = {
  'invalid-argument': { title: 'Invalid argument', retryable: false },
  'invalid-cursor': { title: 'Invalid cursor', retryable: false },
  'not-found': { title: 'Not found', retryable: false },
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
  data_unavailable: 'data-unavailable',
  rate_limited: 'rate-limited',
  unauthorized: 'unauthorized',
};

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

export function problem(name: ProblemName, detail: string, members: Record<string, unknown> = {}): Problem {
  const { title, retryable } = problemKinds[name];
  return { type: problemTypeBase + name, title, detail, ...members, retryable };
}

export function nameOf(found: Problem): ProblemName {
  return found.type.slice(problemTypeBase.length) as ProblemName;
}

export function problemFromPostgres(error: PostgresError): Problem {
  const name = problemOfPostgresCode[error.code];
  if (!name) {
    return problem('internal-error', 'Something went wrong in mtgscan. Try again.');
  }
  return problem(name, error.message, membersOfDetails(error.details));
}

function membersOfDetails(details: string | null): Record<string, unknown> {
  if (!details) {
    return {};
  }
  if (details.startsWith('{')) {
    return JSON.parse(details);
  }
  return { pointer: pointerOfField(details) };
}

function pointerOfField(field: string): string {
  return field
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((token) => '/' + token.replaceAll('~', '~0').replaceAll('/', '~1'))
    .join('');
}

export function httpProblem(name: ProblemName, status: number, detail: string): Response {
  const { title } = problemKinds[name];
  return new Response(JSON.stringify({ type: problemTypeBase + name, title, status, detail }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}
