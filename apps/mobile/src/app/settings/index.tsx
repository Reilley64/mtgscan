import { router } from 'expo-router';

import { signOut, useSession } from '@/auth/session';
import { currentSignInProviderName } from '@/auth/sign-in';
import { usePriceCurrency } from '@/collection/price-currency-setting';
import { ParityCheckSection } from '@/components/organisms/parity-check-section';
import { SettingsContent } from '@/components/organisms/settings-content';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { useGallerySummary } from '@/gallery/gallery-summary';
import { useParityCheck } from '@/gallery/parity-check';
import { useScanSounds } from '@/scan/scan-sounds-setting';

export default function SettingsDrawer() {
  const user = useSession()?.user;
  const gallery = useGallerySummary();
  const { scanSounds, setScanSounds } = useScanSounds();
  const { priceCurrency } = usePriceCurrency();
  const parityCheck = useParityCheck();

  return (
    <DrawerSheet title="Settings">
      <SettingsContent
        account={{ provider: user ? currentSignInProviderName(user) : '', email: user?.email }}
        gallery={gallery}
        currency={priceCurrency?.currency}
        onOpenCurrency={() => router.push('/settings/currency')}
        scanSounds={scanSounds}
        onScanSoundsChange={setScanSounds}
        onSignOut={signOut}
      />
      {__DEV__ ? <ParityCheckSection check={parityCheck.check} onRun={parityCheck.run} /> : null}
    </DrawerSheet>
  );
}
