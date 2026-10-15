import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';

type SaveBarProps = {
  changeCount: number;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
};

function saveLabel(changeCount: number) {
  return `Save ${changeCount} ${changeCount === 1 ? 'change' : 'changes'}`;
}

export function SaveBar({ changeCount, saving, onCancel, onSave }: SaveBarProps) {
  return (
    <View className="flex-row gap-sm">
      <Button className="flex-1" disabled={saving} onPress={onCancel}>
        <Text>Cancel</Text>
      </Button>
      <Button variant="primary" className="flex-1" disabled={changeCount === 0} busy={saving} onPress={onSave}>
        <Text>{saveLabel(changeCount)}</Text>
      </Button>
    </View>
  );
}
