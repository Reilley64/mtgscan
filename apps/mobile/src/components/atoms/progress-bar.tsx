import { cva, type VariantProps } from 'class-variance-authority';
import { View } from 'react-native';

const fills = cva('h-full', {
  variants: {
    tone: {
      muted: 'bg-text-muted',
      primary: 'bg-primary',
    },
  },
});

type ProgressBarProps = {
  label: string;
  value: number;
  max: number;
} & VariantProps<typeof fills>;

export function ProgressBar({ label, value, max, tone = 'muted' }: ProgressBarProps) {
  const share = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value }}
      className="h-progress-bar overflow-hidden rounded-full bg-line">
      <View className={fills({ tone })} style={{ width: `${share * 100}%` }} />
    </View>
  );
}
