import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from 'expo-apple-authentication';
import { ActivityIndicator, View } from 'react-native';

import { cn } from '@/lib/class-names';
import { appleButtonColors, rounded, sizes } from '@/theme';

type AppleSignInButtonProps = {
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
};

const nativeButtonSize = { height: sizes.signInButton };

export function AppleSignInButton({ busy, disabled, onPress }: AppleSignInButtonProps) {
  if (busy) {
    return (
      <View
        accessible
        accessibilityLabel="Sign in with Apple"
        accessibilityRole="button"
        accessibilityState={{ busy: true, disabled: true }}
        className="h-sign-in-button items-center justify-center rounded-sm bg-button-apple">
        <ActivityIndicator color={appleButtonColors.text} />
      </View>
    );
  }
  return (
    <View className={cn(disabled && 'opacity-dimmed')}>
      <AppleAuthenticationButton
        buttonType={AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={rounded.sm}
        onPress={() => {
          if (!disabled) {
            onPress();
          }
        }}
        style={nativeButtonSize}
      />
    </View>
  );
}
