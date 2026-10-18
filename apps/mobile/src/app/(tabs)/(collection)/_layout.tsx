import { Stack } from 'expo-router';

import { CollectionSearchProvider } from '@/collection/collection-search-state';
import { halfHeightDrawerOptions } from '@/components/templates/drawer-sheet';
import { TabStack } from '@/components/templates/tab-stack';

export default function CollectionLayout() {
  return (
    <CollectionSearchProvider>
      <TabStack>
        <Stack.Screen name="collection" />
        <Stack.Screen name="sets" />
        <Stack.Screen name="filters" options={{ ...halfHeightDrawerOptions, headerShown: false }} />
      </TabStack>
    </CollectionSearchProvider>
  );
}
