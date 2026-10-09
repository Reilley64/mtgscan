import { resetFakeSupabase } from './fake-supabase';

jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual('node:crypto');
  return {
    ...jest.requireActual('expo-crypto'),
    randomUUID: () => nodeCrypto.randomUUID(),
    digestStringAsync: async (algorithm: string, data: string) =>
      nodeCrypto.createHash(algorithm.replace('-', '').toLowerCase()).update(data).digest('hex'),
  };
});

jest.mock('@/lib/supabase', () => ({
  supabase: jest.requireActual('./fake-supabase').fakeSupabase,
}));

beforeEach(() => {
  resetFakeSupabase();
});
