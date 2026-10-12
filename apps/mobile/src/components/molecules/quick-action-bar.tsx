import { Children, Fragment, type ReactNode } from 'react';
import { View } from 'react-native';

export function QuickActionBar({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row items-center self-center rounded-md bg-surface-control">
      {Children.toArray(children).map((action, index) => (
        <Fragment key={index}>
          {index > 0 ? <View className="h-quick-action-divider border-l-hairline border-line" /> : null}
          {action}
        </Fragment>
      ))}
    </View>
  );
}
