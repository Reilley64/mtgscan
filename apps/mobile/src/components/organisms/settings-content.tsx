import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { AccountCard } from '@/components/molecules/account-card';
import { DisclosureRow } from '@/components/molecules/disclosure-row';
import { GalleryCard } from '@/components/molecules/gallery-card';
import { SwitchRow } from '@/components/molecules/switch-row';

type SettingsContentProps = {
  account: ComponentProps<typeof AccountCard>;
  gallery: ComponentProps<typeof GalleryCard>;
  currency: string | undefined;
  onOpenCurrency: () => void;
  scanSounds: boolean;
  onScanSoundsChange: (on: boolean) => void;
  onSignOut: () => void;
};

export function SettingsContent({
  account,
  gallery,
  currency,
  onOpenCurrency,
  scanSounds,
  onScanSoundsChange,
  onSignOut,
}: SettingsContentProps) {
  return (
    <>
      <AccountCard {...account} />
      <GalleryCard {...gallery} />
      <DisclosureRow accessibilityLabel={currency ? `Currency, ${currency}` : 'Currency'} onPress={onOpenCurrency}>
        <View className="flex-row items-center gap-md">
          <Text variant="body-strong" className="flex-1">
            Currency
          </Text>
          {currency ? <Text className="text-text-muted">{currency}</Text> : null}
        </View>
      </DisclosureRow>
      <SwitchRow title="Scan sounds" value={scanSounds} onValueChange={onScanSoundsChange} />
      <Button onPress={onSignOut}>
        <Text>Sign out</Text>
      </Button>
      <Text variant="credit">
        mtgscan is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
      </Text>
    </>
  );
}
