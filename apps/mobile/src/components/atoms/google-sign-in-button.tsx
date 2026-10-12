import { Image } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';

type GoogleSignInButtonProps = {
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
};

export function GoogleSignInButton({ busy, disabled, onPress }: GoogleSignInButtonProps) {
  return (
    <Button variant="google" size="sign-in" busy={busy} disabled={disabled} onPress={onPress}>
      {busy ? null : <Image source={require('../../../assets/google-logo.png')} className="h-google-logo w-google-logo" />}
      <Text>Continue with Google</Text>
    </Button>
  );
}
