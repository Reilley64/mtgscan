import { signOut, useSession } from '@/auth/session';
import { currentSignInProviderName } from '@/auth/sign-in';
import { SettingsContent } from '@/components/organisms/settings-content';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { useGallerySummary } from '@/gallery/gallery-summary';
import { useScanSounds } from '@/scan/scan-sounds-setting';

export default function SettingsDrawer() {
  const user = useSession()?.user;
  const gallery = useGallerySummary();
  const { scanSounds, setScanSounds } = useScanSounds();

  return (
    <DrawerSheet title="Settings">
      <SettingsContent
        account={{ provider: user ? currentSignInProviderName(user) : '', email: user?.email }}
        gallery={gallery}
        scanSounds={scanSounds}
        onScanSoundsChange={setScanSounds}
        onSignOut={signOut}
      />
    </DrawerSheet>
  );
}
