import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

export type FocusedRead<Loaded extends { status: string }> = { status: 'loading' } | { status: 'failed' } | Loaded;

export function useFocusedRead<Loaded extends { status: string }>(readOnce: () => Promise<Loaded>) {
  const [read, setRead] = useState<FocusedRead<Loaded>>({ status: 'loading' });
  const latestRead = useRef(0);

  const reload = useCallback(() => {
    const thisRead = ++latestRead.current;
    setRead((current) => (current.status === 'failed' ? { status: 'loading' } : current));
    readOnce().then(
      (next) => thisRead === latestRead.current && setRead(next),
      () => thisRead === latestRead.current && setRead({ status: 'failed' }),
    );
  }, [readOnce]);

  useFocusEffect(reload);

  return { read, reload };
}
