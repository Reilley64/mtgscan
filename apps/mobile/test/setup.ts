import { registerAppStyles } from './class-styles';
import { resetFakeAlert } from './fake-alert';
import { resetFakeCardDetector } from './fake-card-detector';
import { resetFakeCardRecognizer } from './fake-card-recognizer';
import { resetFakeFileSystem } from './fake-file-system';
import { resetFakeGlassEffect } from './fake-glass-effect';
import { resetFakeLocalization } from './fake-localization';
import { resetFakeScanFeedback } from './fake-scan-feedback';
import { resetFakeSecureStore } from './fake-secure-store';
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

jest.mock('expo-file-system', () => jest.requireActual('./fake-file-system').fakeFileSystem);

jest.mock('expo-glass-effect', () => jest.requireActual('./fake-glass-effect').fakeGlassEffect);

jest.mock('expo-haptics', () => jest.requireActual('./fake-scan-feedback').fakeHaptics);

jest.mock('@/scan/scan-sounds', () => jest.requireActual('./fake-scan-feedback').fakeScanSounds);

jest.mock('expo-secure-store', () => jest.requireActual('./fake-secure-store').fakeSecureStore);

jest.mock('expo-localization', () => jest.requireActual('./fake-localization').fakeLocalization);

beforeEach(async () => {
  await registerAppStyles();
  jest.spyOn(console, 'info').mockImplementation(() => {});
  resetFakeSupabase();
  resetFakeAlert();
  resetFakeCardDetector();
  resetFakeCardRecognizer();
  resetFakeFileSystem();
  resetFakeGlassEffect();
  resetFakeScanFeedback();
  resetFakeSecureStore();
  resetFakeLocalization();
});
