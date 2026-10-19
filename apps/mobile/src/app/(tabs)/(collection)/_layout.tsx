import { Stack } from 'expo-router';

import { CollectionSearchProvider } from '@/collection/collection-search-state';
import { halfHeightDrawerOptions } from '@/components/templates/drawer-sheet';
import { TabStack } from '@/components/templates/tab-stack';
import { FinishViewProvider } from '@/sets/finish-view-setting';

export default function CollectionLayout() {
  return (
    <CollectionSearchProvider>
      <FinishViewProvider>
        <TabStack>
          <Stack.Screen name="collection" />
          <Stack.Screen name="sets" />
          <Stack.Screen name="set" options={{ headerLargeTitleEnabled: false }} />
          <Stack.Screen name="filters" options={{ ...halfHeightDrawerOptions, headerShown: false }} />
        </TabStack>
      </FinishViewProvider>
    </CollectionSearchProvider>
  );
}
