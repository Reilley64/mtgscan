import { NativeTabs } from 'expo-router/native-tabs';
import { useEffect, useState } from 'react';

import { useNeedsYouCounts } from '@/needs-you/needs-you-counts';
import { colors, typography } from '@/theme';

const badgeDelayMs = 1500;

function useTabBarSettled() {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), badgeDelayMs);
    return () => clearTimeout(timer);
  }, []);
  return settled;
}

export default function TabsLayout() {
  const { total } = useNeedsYouCounts();
  const settled = useTabBarSettled();
  return (
    <NativeTabs
      backgroundColor={colors.background}
      badgeBackgroundColor={colors.badge}
      shadowColor={colors.line}
      tintColor={colors.primary}
      iconColor={{ default: colors.textDim, selected: colors.primary }}
      labelStyle={{
        default: { ...typography.tabLabel, color: colors.textDim },
        selected: { ...typography.tabLabel, color: colors.primary },
      }}>
      <NativeTabs.Trigger name="(recent)">
        <NativeTabs.Trigger.Label>Recent</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock" />
        {settled && total > 0 ? <NativeTabs.Trigger.Badge>{String(total)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(collection)">
        <NativeTabs.Trigger.Label>Collection</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="square.grid.3x3" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(decks)">
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
