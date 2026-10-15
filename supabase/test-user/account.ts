export const localSupabaseUrl = 'http://127.0.0.1:54321';

export const testUser = {
  email: 'test-user@mtgscan.test',
  password: 'local-test-user',
};

const localStackUrlPattern = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/;

export function isLocalStack(url: string | undefined): boolean {
  return url !== undefined && localStackUrlPattern.test(url);
}

export function isHostedTestUserPassword(password: string | undefined): password is string {
  return password !== undefined && password !== '' && password !== testUser.password;
}
