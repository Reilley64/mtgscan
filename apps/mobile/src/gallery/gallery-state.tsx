import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/auth/session';

import {
  addGalleryDownloadListener,
  galleryDownloadStatus,
  installedGallery,
  type GalleryDownloadStatus,
  type InstalledGallery,
} from '../../modules/card-recognizer';
import { checkForGallery, GalleryOffline } from './gallery-delivery';

export type GalleryProgress = { bytesDone: number; bytesTotal: number };

export type GalleryDelivery =
  | { kind: 'checking' }
  | { kind: 'up_to_date' }
  | ({ kind: 'downloading' } & GalleryProgress)
  | ({ kind: 'waiting_for_wifi' } & GalleryProgress)
  | { kind: 'paused' }
  | { kind: 'failed' }
  | { kind: 'not_enough_space'; bytesNeeded: number };

type Gallery = {
  installed: InstalledGallery | null | undefined;
  delivery: GalleryDelivery;
  downloadNow: () => void;
  tryAgain: () => void;
};

const GalleryContext = createContext<Gallery | null>(null);

function deliveryOf({ state, bytesDone, bytesTotal, bytesNeeded }: GalleryDownloadStatus): GalleryDelivery {
  switch (state) {
    case 'downloading':
      return { kind: 'downloading', bytesDone, bytesTotal };
    case 'installing':
      return { kind: 'downloading', bytesDone: bytesTotal, bytesTotal };
    case 'waiting_for_wifi':
      return { kind: 'waiting_for_wifi', bytesDone, bytesTotal };
    case 'waiting_for_network':
      return { kind: 'paused' };
    case 'installed':
      return { kind: 'up_to_date' };
    case 'failed':
      return { kind: 'failed' };
    case 'not_enough_space':
      return { kind: 'not_enough_space', bytesNeeded: bytesNeeded ?? 0 };
  }
}

async function deliveryAfterCheck(allowsCellularAccess: boolean): Promise<GalleryDelivery | null> {
  try {
    return (await checkForGallery(allowsCellularAccess)) === 'up_to_date' ? { kind: 'up_to_date' } : null;
  } catch (error) {
    return { kind: error instanceof GalleryOffline ? 'paused' : 'failed' };
  }
}

export function GalleryProvider({ children }: { children: ReactNode }) {
  const userId = useSession()?.user.id;
  const [installed, setInstalled] = useState<InstalledGallery | null>();
  const [delivery, setDelivery] = useState<GalleryDelivery>({ kind: 'checking' });

  const check = useCallback((allowsCellularAccess: boolean) => {
    void deliveryAfterCheck(allowsCellularAccess).then((next) => {
      if (next) {
        setDelivery(next);
      }
    });
  }, []);

  useEffect(() => {
    let current = true;
    const subscription = addGalleryDownloadListener((status) => {
      setDelivery(deliveryOf(status));
      if (status.state === 'installed') {
        void installedGallery().then((gallery) => current && setInstalled(gallery));
      }
    });
    void Promise.all([installedGallery(), galleryDownloadStatus()]).then(([gallery, status]) => {
      if (current) {
        setInstalled(gallery);
        if (status && status.state !== 'installed') {
          setDelivery(deliveryOf(status));
        }
      }
    });
    return () => {
      current = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (userId) {
      check(false);
    }
  }, [check, userId]);

  useEffect(() => {
    if (!userId || delivery.kind !== 'paused') {
      return;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        check(false);
      }
    });
    return () => subscription.remove();
  }, [check, delivery.kind, userId]);

  const gallery = useMemo<Gallery>(
    () => ({
      installed,
      delivery,
      downloadNow: () => check(true),
      tryAgain: () => {
        setDelivery({ kind: 'checking' });
        check(false);
      },
    }),
    [check, delivery, installed],
  );

  return <GalleryContext value={gallery}>{children}</GalleryContext>;
}

export function useGallery(): Gallery {
  const gallery = use(GalleryContext);
  if (!gallery) {
    throw new Error('useGallery needs a GalleryProvider');
  }
  return gallery;
}
