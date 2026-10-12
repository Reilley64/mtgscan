import type { ComponentProps } from 'react';
import { Switch as NativeSwitch } from 'react-native';

import { colors } from '@/theme';

type SwitchProps = Omit<ComponentProps<typeof NativeSwitch>, 'style' | 'trackColor' | 'thumbColor' | 'ios_backgroundColor'>;

const trackColor = { true: colors.primary, false: colors.surfaceControl };

export function Switch(props: SwitchProps) {
  return <NativeSwitch trackColor={trackColor} ios_backgroundColor={colors.surfaceControl} {...props} />;
}
