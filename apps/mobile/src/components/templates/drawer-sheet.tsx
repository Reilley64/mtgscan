import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Text } from '@/components/atoms/text';
import { cn } from '@/lib/class-names';

type DrawerSheetProps = {
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
};

export function DrawerSheet({ title, footer, children }: DrawerSheetProps) {
  return (
    <>
      {title ? (
        <View collapsable={false} className="bg-sheet pb-lg pt-xl">
          <Text variant="sheet-title" className="text-center">
            {title}
          </Text>
        </View>
      ) : null}
      <ScrollView
        className="flex-1 bg-sheet"
        contentContainerClassName={cn('gap-lg px-lg pb-xl', !title && 'pt-xl')}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets>
        {children}
      </ScrollView>
      {footer ? <View className="gap-sm bg-sheet px-lg pb-safe-offset-lg pt-sm">{footer}</View> : null}
    </>
  );
}
