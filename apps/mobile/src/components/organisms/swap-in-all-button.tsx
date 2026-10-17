import type { PlannedSwap } from '@mtgscan/supabase/planned-swaps';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { swapInPlannedSwaps } from '@/planned-swaps/planned-swap-writes';

type SwapInAllButtonProps = {
  deckId: string;
  plannedSwaps: PlannedSwap[];
  onChanged: () => void;
};

export function SwapInAllButton({ deckId, plannedSwaps, onChanged }: SwapInAllButtonProps) {
  const [swappingIn, setSwappingIn] = useState(false);

  async function swapInAll() {
    setSwappingIn(true);
    const result = await swapInPlannedSwaps(deckId, plannedSwaps.map((swap) => swap.planned_swap_id));
    setSwappingIn(false);
    if (result === 'failed') {
      Alert.alert('Could not swap in all cards', 'Check your connection.');
    } else if (typeof result === 'object') {
      const card = plannedSwaps.find((swap) => swap.planned_swap_id === result.thirdCommander)?.incoming.name;
      Alert.alert('Could not swap in all cards', `${card} would make a third commander. Nothing was swapped in.`);
    } else {
      onChanged();
    }
  }

  function confirmSwapInAll() {
    Alert.alert(`Swap in ${plannedSwaps.length} cards?`, 'Do this after you sleeve them.', [
      { text: 'Swap in all', onPress: () => void swapInAll() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <Button variant="primary" busy={swappingIn} onPress={confirmSwapInAll}>
      <Text>Swap in all</Text>
    </Button>
  );
}
