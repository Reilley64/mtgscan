import * as Haptics from 'expo-haptics';

import { playScanSound } from './scan-sounds';
import type { ScanOutcome } from './scan-batch-state';

function ignoreFailure(feedback: Promise<void>) {
  feedback.catch(() => {});
}

export function playScanFeedback(outcome: ScanOutcome, scanSounds: boolean) {
  if (outcome !== 'recognized' && outcome !== 'failed') {
    return;
  }
  ignoreFailure(
    outcome === 'recognized'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  );
  if (scanSounds) {
    ignoreFailure(playScanSound(outcome));
  }
}
