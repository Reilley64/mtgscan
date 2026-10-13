import { DangerMark } from '@/components/atoms/danger-mark';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';

export function FailureNotice({ message }: { message: string }) {
  return (
    <Surface
      accessible
      accessibilityLabel={message}
      accessibilityRole="alert"
      className="flex-row items-baseline gap-sm px-md py-md">
      <DangerMark />
      <Text variant="body-strong" className="flex-1">
        {message}
      </Text>
    </Surface>
  );
}
