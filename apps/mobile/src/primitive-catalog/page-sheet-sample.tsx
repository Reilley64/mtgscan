import { router } from 'expo-router';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { ListRow } from '@/components/molecules/list-row';
import { PageSheet } from '@/components/templates/page-sheet';

export function PageSheetSample() {
  return (
    <PageSheet
      title="Page sheet"
      onDone={() => router.back()}
      footer={
        <Button variant="primary" onPress={() => router.back()}>
          <Text>The footer stays at the bottom</Text>
        </Button>
      }>
      {Array.from({ length: 16 }, (_, index) => (
        <ListRow key={index} title={`Row ${index + 1}`} />
      ))}
    </PageSheet>
  );
}
