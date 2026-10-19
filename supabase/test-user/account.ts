export const localSupabaseUrl = `http://127.0.0.1:${process.env.SUPABASE_API_PORT ?? 54321}`;

export const testUser = {
  email: 'test-user@mtgscan.test',
  password: 'local-test-user',
};

const localStackUrlPattern = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/;

export function isLocalStack(url: string | undefined): boolean {
  return url !== undefined && localStackUrlPattern.test(url);
}

type SupabaseSettings = Record<string, string | undefined>;

export function supabaseUrlOf({ SUPABASE_URL, SUPABASE_PROJECT_REF }: SupabaseSettings): string | undefined {
  return SUPABASE_URL || (SUPABASE_PROJECT_REF ? `https://${SUPABASE_PROJECT_REF}.supabase.co` : undefined);
}

export function hostedSupabaseUrl(settings: SupabaseSettings): { url: string } | { refusal: string } {
  const url = supabaseUrlOf(settings);
  if (url === undefined) {
    return { refusal: 'With --hosted, load SUPABASE_PROJECT_REF and SUPABASE_SECRET_KEY with `bun --env-file=.env.hosted`.' };
  }
  if (isLocalStack(url)) {
    return { refusal: `With --hosted, the local stack at ${url} is refused. Unset SUPABASE_URL, and load SUPABASE_PROJECT_REF with \`bun --env-file=.env.hosted\`.` };
  }
  return { url };
}

export function isHostedTestUserPassword(password: string | undefined): password is string {
  return password !== undefined && password !== '' && password !== testUser.password;
}
