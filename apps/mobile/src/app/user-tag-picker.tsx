import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useCopy } from '@/collection/use-copy';
import { setCopyUserTag } from '@/collection/copy-writes';
import { createUserTagOnCopy, deleteUserTag, renameUserTag, useUserTags, type UserTagWriteResult } from '@/collection/user-tags';
import { Text } from '@/components/atoms/text';
import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { UserTagPicker } from '@/components/organisms/user-tag-picker';
import { PushedScreen } from '@/components/templates/pushed-screen';
import { colors } from '@/theme';

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

  const change = async <Result extends UserTagWriteResult>(write: Promise<Result>) => {
    const result = await write;
    setChangeFailed(result === 'failed');
    reload();
    return result;
  };

  const readFailed = copyRead.status === 'failed' || userTagsRead.status === 'failed';

  return (
    <PushedScreen>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="chevron.left" tintColor={colors.text} accessibilityLabel="Back" onPress={() => router.back()} />
      </Stack.Toolbar>
      <View className="gap-lg px-lg pt-lg">
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
            onRename={(userTag, name) => change(renameUserTag({ user_tag_id: userTag.user_tag_id, name }))}
            onDelete={(userTag) => change(deleteUserTag({ user_tag_id: userTag.user_tag_id }))}
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
