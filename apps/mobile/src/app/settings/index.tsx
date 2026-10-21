import { currentSignInProviderName } from '@mtgscan/supabase/sign-in-providers';
import { router } from 'expo-router';
import { Alert, Linking } from 'react-native';

import { useAiClients } from '@/ai-clients/ai-clients';
import { signOut, useSession } from '@/auth/session';
import { usePriceCurrency } from '@/collection/price-currency-setting';
import { ParityCheckSection } from '@/components/organisms/parity-check-section';
import { SettingsContent } from '@/components/organisms/settings-content';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { useGallerySummary } from '@/gallery/gallery-summary';
import { useParityCheck } from '@/gallery/parity-check';
import { useScanSounds } from '@/scan/scan-sounds-setting';
import { useTrainingCropUploadsSetting } from '@/scan/training-crop-uploads-setting';

const modelLicenseUrl = 'https://www.apache.org/licenses/LICENSE-2.0';

export default function SettingsDrawer() {
  const user = useSession()?.user;
  const gallery = useGallerySummary();
  const { scanSounds, setScanSounds } = useScanSounds();
  const { priceCurrency } = usePriceCurrency();
  const parityCheck = useParityCheck();
  const { aiClientsRead } = useAiClients();
  const trainingCropUploads = useTrainingCropUploadsSetting();

  async function changeTrainingCropUploadsOrSayItFailed(on: boolean) {
    if (!(await trainingCropUploads.setUploadsOn(on))) {
      Alert.alert('Could not change training crop uploads', 'Check your connection.');
    }
  }

  return (
    <DrawerSheet title="Settings">
      <SettingsContent
        account={{ provider: user ? currentSignInProviderName(user) : '', email: user?.email }}
        gallery={gallery}
        currency={priceCurrency?.currency}
        onOpenCurrency={() => router.push('/settings/currency')}
        aiClientCount={aiClientsRead.status === 'loaded' ? aiClientsRead.aiClients.length : undefined}
        onOpenAiClients={() => router.push('/settings/ai-clients')}
        scanSounds={scanSounds}
        onScanSoundsChange={setScanSounds}
        trainingCropUploads={trainingCropUploads.uploadsOn}
        onTrainingCropUploadsChange={(on) => void changeTrainingCropUploadsOrSayItFailed(on)}
        onSignOut={signOut}
        onOpenModelLicense={() => void Linking.openURL(modelLicenseUrl)}
      />
      {__DEV__ ? <ParityCheckSection check={parityCheck.check} onRun={parityCheck.run} /> : null}
    </DrawerSheet>
  );
}
