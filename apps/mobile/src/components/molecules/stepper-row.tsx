import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { Stepper, type StepperProps } from '@/components/molecules/stepper';

type StepperRowProps = StepperProps & { uri: string | undefined };

export function StepperRow({ uri, ...stepper }: StepperRowProps) {
  return (
    <Surface className="flex-row items-center gap-md p-sm">
      <CardThumbnail uri={uri} />
      <Text variant="body-strong" numberOfLines={1} className="flex-1">
        {stepper.label}
      </Text>
      <Stepper {...stepper} />
    </Surface>
  );
}
