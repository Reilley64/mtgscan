import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';

import { getCameraPermission, isCameraAvailable, requestCameraPermission } from '../../modules/card-detector';

type CameraAccess = 'checking' | 'unavailable' | 'denied' | 'granted';

async function currentCameraAccess(): Promise<CameraAccess> {
  if (!isCameraAvailable()) {
    return 'unavailable';
  }
  const permission = await getCameraPermission();
  if (permission === 'undetermined') {
    return (await requestCameraPermission()) === 'granted' ? 'granted' : 'denied';
  }
  return permission;
}

export function useCameraAccess() {
  const focused = useIsFocused();
  const [access, setAccess] = useState<CameraAccess>('checking');

  useEffect(() => {
    if (!focused || access !== 'checking') {
      return;
    }
    let current = true;
    void currentCameraAccess().then((next) => {
      if (current) {
        setAccess(next);
      }
    });
    return () => {
      current = false;
    };
  }, [access, focused]);

  return access;
}
