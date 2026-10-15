import { cva } from 'class-variance-authority';
import { View } from 'react-native';

import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { Text } from '@/components/atoms/text';
import { ListRow } from '@/components/molecules/list-row';

const changeSigns = { incoming: '+', outgoing: '\u2212' } as const;

const signVariants = cva('', {
  variants: {
    direction: {
      incoming: 'text-incoming',
      outgoing: 'text-outgoing',
    },
  },
});

type ChangeLineProps = {
  direction: keyof typeof changeSigns;
  uri: string | undefined;
  name: string;
  detail: string;
};

export function ChangeLine({ direction, uri, name, detail }: ChangeLineProps) {
  const sign = changeSigns[direction];
  return (
    <ListRow
      spokenBefore={sign}
      title={name}
      detail={detail}
      leading={
        <View className="flex-row items-center gap-md">
          <Text variant="body-strong" className={signVariants({ direction })}>
            {sign}
          </Text>
          <CardThumbnail uri={uri} />
        </View>
      }
    />
  );
}
