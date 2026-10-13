import { useEffect, useState } from 'react';
import { Animated } from 'react-native';

import { placeholderFills, useOnGlass } from '@/components/atoms/glass-surface';
import { cn } from '@/lib/class-names';

const pulseMs = 650;
const dimOpacity = 0.45;

export function Skeleton({ className }: { className?: string }) {
  const onGlass = useOnGlass();
  const [opacity] = useState(() => new Animated.Value(dimOpacity));
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: pulseMs, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: dimOpacity, duration: pulseMs, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);
  return <Animated.View style={{ opacity }} className={cn('rounded-xs', placeholderFills({ onGlass }), className)} />;
}
