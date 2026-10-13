import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';

type PageSheetProps = {
  title: string;
  onDone: () => void;
  footer: ReactNode;
  children: ReactNode;
};

export function PageSheet({ title, onDone, footer, children }: PageSheetProps) {
  return (
    <View className="flex-1 bg-sheet">
      <View className="flex-row items-center justify-between px-lg pb-sm pt-lg">
        <Text variant="sheet-title">{title}</Text>
        <Button onPress={onDone}>
          <Text>Done</Text>
        </Button>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-lg px-lg py-lg">
        {children}
      </ScrollView>
      <View className="gap-sm px-lg pb-safe-offset-lg pt-sm">{footer}</View>
    </View>
  );
}
