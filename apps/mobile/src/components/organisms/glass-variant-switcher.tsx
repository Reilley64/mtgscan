import { View } from 'react-native';

import {
  glassVariantKeys,
  glassVariants,
  liquidGlassAvailable,
  type GlassVariant,
} from '@/components/atoms/liquid-glass-prototype';
import { Text } from '@/components/atoms/text';
import { ToggleGroup } from '@/components/molecules/toggle-group';

type GlassVariantSwitcherProps = {
  variant: GlassVariant;
  onSelect: (variant: GlassVariant) => void;
};

export function GlassVariantSwitcher({ variant, onSelect }: GlassVariantSwitcherProps) {
  return (
    <View className="w-[200px] gap-xs self-center">
      <ToggleGroup values={glassVariantKeys} selected={variant} labelOf={(key) => key} onSelect={onSelect} />
      <View className="self-center rounded-full bg-quantity-badge px-sm py-xs">
        <Text variant="chip">
          {liquidGlassAvailable ? `${variant}: ${glassVariants[variant].name}` : 'Liquid Glass not available. All variants show A.'}
        </Text>
      </View>
    </View>
  );
}
