import type { FreeCopy } from '@mtgscan/supabase/buylist';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';

import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { EmptyState } from '@/components/molecules/empty-state';
import { EmptyBinderSlots } from '@/components/molecules/empty-state-illustrations';
import { ListRow } from '@/components/molecules/list-row';
import { ReadFailure } from '@/components/molecules/read-failure';
import { WarningLine } from '@/components/molecules/warning-line';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { markBuylistCardBought } from '@/buylist/buylist-writes';
import { printingLabel } from '@/collection/copy-labels';
import { useFreeCopies } from '@/buylist/use-free-copies';
import { colors } from '@/theme';

export default function BoughtSheet() {
  const { buylistCardId, oracleId } = useLocalSearchParams<{ buylistCardId: string; oracleId: string }>();
  const { read, reload } = useFreeCopies(oracleId);

  async function buy(copy: FreeCopy) {
    const result = await markBuylistCardBought({ buylist_card_id: buylistCardId, copy_id: copy.copy_id, unprotect: copy.protected });
    if (result === 'failed') {
      Alert.alert('Could not mark this card bought', 'Check your connection.');
    } else if (result === 'commander_limit') {
      Alert.alert('Could not mark this card bought', 'A deck has at most two commanders.');
    } else if (result === 'outdated') {
      reload();
    } else {
      router.back();
    }
  }

  return (
    <DrawerSheet>
      <Stack.Screen options={{ title: 'Bought' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button tintColor={colors.text} onPress={() => router.back()}>
          Cancel
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      {read.status === 'loaded'
        ? read.copies.map((copy) => (
            <View key={copy.copy_id} className="gap-sm">
              <ListRow
                leading={<CardThumbnail uri={copy.image_uris[0]} />}
                title={copy.name}
                detail={printingLabel(copy)}
                onPress={() => void buy(copy)}
              />
              {copy.protected ? <WarningLine message={`${copy.name} is protected. Picking it unprotects it.`} /> : null}
            </View>
          ))
        : null}
      {read.status === 'loaded' && read.copies.length === 0 ? (
        <EmptyState
          illustration={<EmptyBinderSlots rows={1} />}
          title="No copies found"
          message="Scan copies into your collection first."
        />
      ) : null}
      {read.status === 'failed' ? (
        <ReadFailure illustration={<EmptyBinderSlots rows={1} />} title="Could not load your copies" onTryAgain={reload} />
      ) : null}
    </DrawerSheet>
  );
}
