import { Children, Fragment, type ReactNode } from 'react';
import { View } from 'react-native';

import { GlassSurface } from '@/components/atoms/liquid-glass-prototype';

export function QuickActionBar({ children }: { children: ReactNode }) {
  return (
    <GlassSurface className="flex-row items-center self-center rounded-md" fallbackClassName="bg-surface-control" interactive>
      {Children.toArray(children).map((action, index) => (
        <Fragment key={index}>
          {index > 0 ? <View className="h-quick-action-divider border-l-hairline border-line" /> : null}
          {action}
        </Fragment>
      ))}
    </GlassSurface>
  );
}
