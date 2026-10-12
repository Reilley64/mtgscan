import { View } from 'react-native';

type ProgressBarProps = {
  label: string;
  value: number;
  max: number;
};

export function ProgressBar({ label, value, max }: ProgressBarProps) {
  const share = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value }}
      className="h-progress-bar overflow-hidden rounded-full bg-line">
      <View className="h-full bg-text-muted" style={{ width: `${share * 100}%` }} />
    </View>
  );
}
