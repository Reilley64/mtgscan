import { Alert, Button, Host, Text, TextField, useNativeState } from '@expo/ui/swift-ui';
import { disabled } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';

type NameAlertProps = {
  title: string;
  message: string;
  placeholder: string;
  confirmLabel: string;
  maxLength: number;
  initialName?: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
};

export function NameAlert({
  title,
  message,
  placeholder,
  confirmLabel,
  maxLength,
  initialName = '',
  onConfirm,
  onClose,
}: NameAlertProps) {
  const text = useNativeState(initialName);
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  return (
    <Host matchContents>
      <Alert title={title} isPresented onIsPresentedChange={(presented) => !presented && onClose()}>
        <Alert.Trigger>
          <Text> </Text>
        </Alert.Trigger>
        <Alert.Actions>
          <TextField text={text} placeholder={placeholder} maxLength={maxLength} autoFocus onTextChange={setName} />
          <Button label="Cancel" role="cancel" />
          <Button label={confirmLabel} modifiers={[disabled(trimmed === '')]} onPress={() => onConfirm(trimmed)} />
        </Alert.Actions>
        <Alert.Message>
          <Text>{message}</Text>
        </Alert.Message>
      </Alert>
    </Host>
  );
}
