import { useKeepAwake } from 'expo-keep-awake';
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

const scanRoutes = new Set(['scan', 'scan-batch', 'scan-details', 'scan-printings', 'scan-condition', 'scan-language']);

function isScanRoute(pathname: string) {
  return scanRoutes.has(pathname.split('/')[1] ?? '');
}

function useAppInForeground() {
  const [inForeground, setInForeground] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setInForeground(state !== 'background'));
    return () => subscription.remove();
  }, []);
  return inForeground;
}

function KeepAwake() {
  useKeepAwake();
  return null;
}

export function KeepAwakeWhileScanning() {
  const scanning = isScanRoute(usePathname());
  const inForeground = useAppInForeground();
  return scanning && inForeground ? <KeepAwake /> : null;
}
