import { resetFakeCardDetector } from './fake-card-detector';
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

jest.mock('../modules/card-detector', () => jest.requireActual('./fake-card-detector').fakeCardDetector);

beforeEach(() => {
  jest.spyOn(console, 'info').mockImplementation(() => {});
  resetFakeSupabase();
  resetFakeCardDetector();
});
