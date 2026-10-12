import { registerAppStyles } from './class-styles';
import { resetFakeCardDetector } from './fake-card-detector';
import { resetFakeCardRecognizer } from './fake-card-recognizer';
import { resetFakeScanFeedback } from './fake-scan-feedback';
import { resetFakeSupabase } from './fake-supabase';

require('react-native-reanimated').setUpTests();

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

jest.mock('../modules/card-recognizer', () => jest.requireActual('./fake-card-recognizer').fakeCardRecognizer);

jest.mock('expo-haptics', () => jest.requireActual('./fake-scan-feedback').fakeHaptics);

jest.mock('@/scan/scan-sounds', () => jest.requireActual('./fake-scan-feedback').fakeScanSounds);

beforeEach(async () => {
  await registerAppStyles();
  jest.spyOn(console, 'info').mockImplementation(() => {});
  resetFakeSupabase();
  resetFakeCardDetector();
  resetFakeCardRecognizer();
  resetFakeScanFeedback();
});
