import { focusManager, notifyManager } from '@tanstack/react-query';

import { registerAppStyles } from './class-styles';
import { resetFakeAlert } from './fake-alert';
import { resetFakeCardDetector } from './fake-card-detector';
import { resetFakeCardRecognizer } from './fake-card-recognizer';
import { resetFakeClipboard } from './fake-clipboard';
import { resetFakeFileSystem } from './fake-file-system';
import { resetFakeGlassEffect } from './fake-glass-effect';
import { resetFakeKeepAwake } from './fake-keep-awake';
import { resetFakeLocalization } from './fake-localization';
import { resetFakeNativeState } from './fake-native-state';
import { resetFakeScanFeedback } from './fake-scan-feedback';
import { resetFakeSecureStore } from './fake-secure-store';
import { resetFakeSupabase } from './fake-supabase';

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co';

require('react-native-reanimated').setUpTests();

global.FormData = jest.requireActual('react-native/Libraries/Network/FormData').default;

notifyManager.setScheduler((notify) => void Promise.resolve().then(notify));

jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual('node:crypto');
  return {
    ...jest.requireActual('expo-crypto'),
    randomUUID: () => nodeCrypto.randomUUID(),
    getRandomValues: (values: Uint32Array) => nodeCrypto.getRandomValues(values),
    digestStringAsync: async (algorithm: string, data: string) =>
      nodeCrypto.createHash(algorithm.replace('-', '').toLowerCase()).update(data).digest('hex'),
  };
});

jest.mock('@/lib/supabase', () => ({
  supabase: jest.requireActual('./fake-supabase').fakeSupabase,
}));

jest.mock('../modules/card-detector', () => jest.requireActual('./fake-card-detector').fakeCardDetector);

jest.mock('../modules/card-recognizer', () => jest.requireActual('./fake-card-recognizer').fakeCardRecognizer);

jest.mock('expo-clipboard', () => jest.requireActual('./fake-clipboard').fakeClipboard);

jest.mock('expo-file-system', () => jest.requireActual('./fake-file-system').fakeFileSystem);

jest.mock('expo-glass-effect', () => jest.requireActual('./fake-glass-effect').fakeGlassEffect);

jest.mock('expo-keep-awake', () => jest.requireActual('./fake-keep-awake').fakeKeepAwake);

jest.mock('expo-haptics', () => jest.requireActual('./fake-scan-feedback').fakeHaptics);

jest.mock('@/scan/scan-sounds', () => jest.requireActual('./fake-scan-feedback').fakeScanSounds);

jest.mock('expo-secure-store', () => jest.requireActual('./fake-secure-store').fakeSecureStore);

jest.mock('expo-localization', () => jest.requireActual('./fake-localization').fakeLocalization);

jest.mock('@shopify/flash-list/dist/native/config/PlatformHelper', () => {
  const platformHelper = jest.requireActual('@shopify/flash-list/dist/native/config/PlatformHelper');
  return { ...platformHelper, PlatformConfig: { ...platformHelper.PlatformConfig, defaultDrawDistance: Number.MAX_SAFE_INTEGER } };
});

jest.mock('@expo/ui/swift-ui', () => jest.requireActual('./fake-native-state').fakeSwiftUI);

beforeEach(async () => {
  await registerAppStyles();
  jest.spyOn(console, 'info').mockImplementation(() => {});
  resetFakeSupabase();
  resetFakeAlert();
  resetFakeCardDetector();
  resetFakeCardRecognizer();
  resetFakeClipboard();
  resetFakeFileSystem();
  resetFakeGlassEffect();
  resetFakeKeepAwake();
  resetFakeScanFeedback();
  resetFakeSecureStore();
  resetFakeLocalization();
  resetFakeNativeState();
  focusManager.setFocused(undefined);
});
