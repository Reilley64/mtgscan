import { useCallback, useState } from 'react';

import { logForDevelopment } from '@/lib/development-log';
import { errorCode } from '@/lib/error-code';

import { checkGalleryParity, type GalleryParity } from '../../modules/card-recognizer';

export type ParityCheck =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'checked'; parity: GalleryParity }
  | { status: 'failed'; code: string };

export function useParityCheck() {
  const [check, setCheck] = useState<ParityCheck>({ status: 'idle' });

  const run = useCallback(async () => {
    setCheck({ status: 'checking' });
    try {
      const parity = await checkGalleryParity();
      logForDevelopment('parity', parity);
      setCheck({ status: 'checked', parity });
    } catch (error) {
      setCheck({ status: 'failed', code: errorCode(error) });
    }
  }, []);

  return { check, run };
}
