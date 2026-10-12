import * as SecureStore from 'expo-secure-store';
import { createContext, use, useMemo, useState, type ReactNode } from 'react';

const scanSoundsKey = 'scan-sounds';

type ScanSoundsSetting = {
  scanSounds: boolean;
  setScanSounds: (on: boolean) => void;
};

const ScanSoundsContext = createContext<ScanSoundsSetting | null>(null);

export function ScanSoundsProvider({ children }: { children: ReactNode }) {
  const [scanSounds, setStoredScanSounds] = useState(() => SecureStore.getItem(scanSoundsKey) !== 'off');

  const setting = useMemo<ScanSoundsSetting>(
    () => ({
      scanSounds,
      setScanSounds: (on) => {
        setStoredScanSounds(on);
        void SecureStore.setItemAsync(scanSoundsKey, on ? 'on' : 'off');
      },
    }),
    [scanSounds],
  );

  return <ScanSoundsContext value={setting}>{children}</ScanSoundsContext>;
}

export function useScanSounds(): ScanSoundsSetting {
  const setting = use(ScanSoundsContext);
  if (!setting) {
    throw new Error('useScanSounds needs a ScanSoundsProvider');
  }
  return setting;
}
