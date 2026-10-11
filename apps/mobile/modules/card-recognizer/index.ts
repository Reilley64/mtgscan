import { requireNativeModule } from 'expo';

import type { CardOutline, Recognition } from './src/recognition';

export type * from './src/recognition';

type CardRecognizerModule = {
  recognize(photoUri: string, outline: CardOutline): Promise<Recognition>;
};

const cardRecognizer = requireNativeModule<CardRecognizerModule>('CardRecognizer');

export function recognize(photoUri: string, outline: CardOutline): Promise<Recognition> {
  return cardRecognizer.recognize(photoUri, outline);
}
