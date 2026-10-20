import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { TextLink } from '@/components/atoms/text-link';
import { AccountCard } from '@/components/molecules/account-card';
import { DisclosureRow } from '@/components/molecules/disclosure-row';
import { GalleryCard } from '@/components/molecules/gallery-card';
import { SwitchRow } from '@/components/molecules/switch-row';

type SettingsContentProps = {
  account: ComponentProps<typeof AccountCard>;
  gallery: ComponentProps<typeof GalleryCard>;
  currency: string | undefined;
  onOpenCurrency: () => void;
  aiClientCount: number | undefined;
  onOpenAiClients: () => void;
  scanSounds: boolean;
  onScanSoundsChange: (on: boolean) => void;
  trainingCropUploads: boolean | null;
  onTrainingCropUploadsChange: (on: boolean) => void;
  onSignOut: () => void;
  onOpenModelLicence: () => void;
};

const trainingCropsMeta =
  'Images of cards you save help improve card recognition. They wait on your phone for up to 7 days. Uploaded crops are not stored with your account and cannot be removed.';

function SettingRow({ title, value, onPress }: { title: string; value: string | undefined; onPress: () => void }) {
  return (
    <DisclosureRow accessibilityLabel={value ? `${title}, ${value}` : title} onPress={onPress}>
      <View className="flex-row items-center gap-md">
        <Text variant="body-strong" className="flex-1">
          {title}
        </Text>
        {value ? <Text className="text-text-muted">{value}</Text> : null}
      </View>
    </DisclosureRow>
  );
}

export function SettingsContent({
  account,
  gallery,
  currency,
  onOpenCurrency,
  aiClientCount,
  onOpenAiClients,
  scanSounds,
  onScanSoundsChange,
  trainingCropUploads,
  onTrainingCropUploadsChange,
  onSignOut,
  onOpenModelLicence,
}: SettingsContentProps) {
  return (
    <>
      <AccountCard {...account} />
      <GalleryCard {...gallery} />
      <SettingRow title="Currency" value={currency} onPress={onOpenCurrency} />
      <SettingRow title="AI clients" value={aiClientCount?.toString()} onPress={onOpenAiClients} />
      <SwitchRow title="Scan sounds" value={scanSounds} onValueChange={onScanSoundsChange} />
      <SwitchRow
        title="Upload training crops"
        meta={trainingCropsMeta}
        value={trainingCropUploads ?? false}
        disabled={trainingCropUploads === null}
        onValueChange={onTrainingCropUploadsChange}
      />
      <Button onPress={onSignOut}>
        <Text>Sign out</Text>
      </Button>
      <Text variant="credit">
        mtgscan is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
      </Text>
      <Text variant="credit">
        Card recognition uses PE-Core S16 by Meta, under the <TextLink onPress={onOpenModelLicence}>Apache License 2.0</TextLink>.
      </Text>
    </>
  );
}
