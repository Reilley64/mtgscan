import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useCopy } from '@/collection/use-copy';
import { createUserTagOnCopy, setCopyUserTag, useUserTags } from '@/collection/user-tags';
import { Text } from '@/components/atoms/text';
import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { UserTagPicker } from '@/components/organisms/user-tag-picker';
import { PushedScreen } from '@/components/templates/pushed-screen';

export default function UserTagPickerScreen() {
  const { copyId } = useLocalSearchParams<{ copyId: string }>();
  const { read: copyRead, reload: reloadCopy } = useCopy(copyId);
  const { read: userTagsRead, reload: reloadUserTags } = useUserTags();
  const [changeFailed, setChangeFailed] = useState(false);

  useEffect(() => {
    if (copyRead.status === 'missing') {
      router.back();
    }
  }, [copyRead.status]);

  const reload = () => {
    reloadCopy();
    reloadUserTags();
  };

  const change = async (write: Promise<boolean>) => {
    setChangeFailed(!(await write));
    reload();
  };

  const readFailed = copyRead.status === 'failed' || userTagsRead.status === 'failed';

  return (
    <PushedScreen>
      <View className="gap-lg px-lg pt-safe-offset-xl">
        <Text variant="sheet-title">User tags</Text>
        {copyRead.status === 'loaded' && userTagsRead.status === 'loaded' ? (
          <UserTagPicker
            copy={copyRead.copy}
            userTags={userTagsRead.userTags}
            changeFailed={changeFailed}
            onToggle={(userTag, tagged) =>
              change(setCopyUserTag({ copy_id: copyId, user_tag_id: userTag.user_tag_id, tagged }))
            }
            onCreate={(name) => change(createUserTagOnCopy(copyId, name))}
          />
        ) : null}
        {readFailed ? (
          <ReadFailure
            illustration={<DashedCardFrame symbol="wifi.slash" />}
            title="Could not load your user tags"
            onTryAgain={reload}
          />
        ) : null}
      </View>
    </PushedScreen>
  );
}
