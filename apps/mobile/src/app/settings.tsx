import { signOut, useSession } from '@/auth/session';
import { currentSignInProviderName } from '@/auth/sign-in';
import { GalleryParityCheck } from '@/components/organisms/gallery-parity-check';
import { SettingsContent } from '@/components/organisms/settings-content';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { useGalleryParity } from '@/gallery/gallery-parity';
import { useGallerySummary } from '@/gallery/gallery-summary';
import { useScanSounds } from '@/scan/scan-sounds-setting';

export default function SettingsDrawer() {
  const user = useSession()?.user;
  const gallery = useGallerySummary();
  const { scanSounds, setScanSounds } = useScanSounds();
  const galleryParity = useGalleryParity();

  return (
    <DrawerSheet title="Settings">
      <SettingsContent
        account={{ provider: user ? currentSignInProviderName(user) : '', email: user?.email }}
        gallery={gallery}
        scanSounds={scanSounds}
        onScanSoundsChange={setScanSounds}
        onSignOut={signOut}
      />
      {__DEV__ ? <GalleryParityCheck check={galleryParity.check} onCheck={galleryParity.run} /> : null}
    </DrawerSheet>
  );
}
