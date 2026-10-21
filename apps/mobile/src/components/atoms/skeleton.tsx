import { useEffect } from 'react';
import { Animated } from 'react-native';

import { placeholderFills, useOnGlass } from '@/components/atoms/glass-surface';
import { cn } from '@/lib/class-names';

const pulseMs = 650;
const dimOpacity = 0.45;

const pulseOpacity = new Animated.Value(dimOpacity);
let pulse: Animated.CompositeAnimation | undefined;
let skeletonsShown = 0;

function usePulse() {
  useEffect(() => {
    if (skeletonsShown++ === 0) {
      pulseOpacity.setValue(dimOpacity);
      pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 1, duration: pulseMs, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: dimOpacity, duration: pulseMs, useNativeDriver: true }),
        ]),
      );
      pulse.start();
    }
    return () => {
      if (--skeletonsShown === 0) {
        pulse?.stop();
      }
    };
  }, []);
  return pulseOpacity;
}

export function Skeleton({ className }: { className?: string }) {
  const onGlass = useOnGlass();
  const opacity = usePulse();
  return <Animated.View style={{ opacity }} className={cn('rounded-xs', placeholderFills({ onGlass }), className)} />;
}
