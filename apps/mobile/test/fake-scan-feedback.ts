import type * as Haptics from 'expo-haptics';

import type { ScanSound } from '@/scan/scan-sounds';

const haptics = jest.requireActual<typeof Haptics>('expo-haptics');

let played: string[] = [];

export const fakeHaptics = {
  ...haptics,
  impactAsync: async (style: Haptics.ImpactFeedbackStyle) => {
    played = [...played, `${style} impact`];
  },
  notificationAsync: async (type: Haptics.NotificationFeedbackType) => {
    played = [...played, `${type} haptic`];
  },
};

export const fakeScanSounds = {
  preloadScanSounds: async () => {},
  playScanSound: async (kind: ScanSound) => {
    played = [...played, `${kind} sound`];
  },
};

export function scanFeedback() {
  return played;
}

export function resetFakeScanFeedback() {
  played = [];
}
