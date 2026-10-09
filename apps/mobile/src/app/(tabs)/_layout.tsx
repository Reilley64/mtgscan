import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { colors, typography } from '@/theme';

export default function TabsLayout() {
  return (
    <NativeTabs
      backgroundColor={colors.background}
      tintColor={colors.primary}
      iconColor={{ default: colors.textDim, selected: colors.primary }}
      labelStyle={{
        default: { ...typography.tabLabel, color: colors.textDim },
        selected: { ...typography.tabLabel, color: colors.primary },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Recent</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="collection">
        <NativeTabs.Trigger.Label>Collection</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="square.grid.3x3" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="decks">
        <NativeTabs.Trigger.Label>Decks</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="rectangle.stack" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scan">
        <NativeTabs.Trigger.Label>Scan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="camera" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
