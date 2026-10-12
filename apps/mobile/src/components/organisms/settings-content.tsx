import type { ComponentProps } from 'react';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { AccountCard } from '@/components/molecules/account-card';
import { GalleryCard } from '@/components/molecules/gallery-card';
import { SwitchRow } from '@/components/molecules/switch-row';

type SettingsContentProps = {
  account: ComponentProps<typeof AccountCard>;
  gallery: ComponentProps<typeof GalleryCard>;
  scanSounds: boolean;
  onScanSoundsChange: (on: boolean) => void;
  onSignOut: () => void;
};

export function SettingsContent({ account, gallery, scanSounds, onScanSoundsChange, onSignOut }: SettingsContentProps) {
  return (
    <>
      <AccountCard {...account} />
      <GalleryCard {...gallery} />
      <SwitchRow title="Scan sounds" value={scanSounds} onValueChange={onScanSoundsChange} />
      <Button onPress={onSignOut}>
        <Text>Sign out</Text>
      </Button>
    </>
  );
}
