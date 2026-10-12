import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';

type AccountCardProps = {
  provider: string;
  email: string | undefined;
};

export function AccountCard({ provider, email }: AccountCardProps) {
  return (
    <Surface className="gap-xs">
      <Text variant="body-strong">Signed in with {provider}</Text>
      {email ? <Text variant="meta">{email}</Text> : null}
    </Surface>
  );
}
