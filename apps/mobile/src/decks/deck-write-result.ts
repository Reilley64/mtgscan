import { router } from 'expo-router';
import { Alert } from 'react-native';

import type { WriteResult } from '@/lib/write-result';

export function backToGallery() {
  router.dismissTo('/decks');
}

export async function showDeckWriteResult(write: Promise<WriteResult>, failureTitle: string, onDone: () => void) {
  const result = await write;
  if (result === 'failed') {
    Alert.alert(failureTitle, 'Check your connection.');
  } else if (result === 'missing') {
    backToGallery();
  } else {
    onDone();
  }
}
