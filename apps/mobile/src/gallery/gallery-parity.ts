import { useCallback, useState } from 'react';

import { checkGalleryParity, type GalleryParity } from '../../modules/card-recognizer';

export type GalleryParityCheck =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'checked'; parity: GalleryParity }
  | { status: 'failed'; code: string };

function errorCode(error: unknown) {
  return (error as { code?: string }).code ?? String(error);
}

export function useGalleryParity() {
  const [check, setCheck] = useState<GalleryParityCheck>({ status: 'idle' });

  const run = useCallback(async () => {
    setCheck({ status: 'checking' });
    try {
      const parity = await checkGalleryParity();
      console.info(`PARITY ${JSON.stringify(parity)}`);
      setCheck({ status: 'checked', parity });
    } catch (error) {
      setCheck({ status: 'failed', code: errorCode(error) });
    }
  }, []);

  return { check, run };
}
