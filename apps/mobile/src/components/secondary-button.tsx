import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

type SecondaryButtonProps = {
  label: string;
  onPress: () => void;
};

export function SecondaryButton({ label, onPress }: SecondaryButtonProps) {
  return (
    <Button variant="secondary" onPress={onPress}>
      <Text>{label}</Text>
    </Button>
  );
}
