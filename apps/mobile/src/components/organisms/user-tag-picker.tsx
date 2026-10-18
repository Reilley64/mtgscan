import { userTagNameLength, type CopyDetails, type UserTag, type UserTagRow } from '@mtgscan/supabase/collection';
import { useState } from 'react';
import { View } from 'react-native';

import { copyNameLine } from '@/collection/copy-labels';
import { shownCopyCount } from '@/collection/total-labels';
import { matchesUserTagName, userTagsFound } from '@/collection/user-tag-names';
import type { UserTagWriteResult } from '@/collection/user-tags';
import { Button } from '@/components/atoms/button';
import { Input } from '@/components/atoms/input';
import { MenuButton } from '@/components/atoms/menu-button';
import { Surface } from '@/components/atoms/surface';
import { SymbolView } from '@/components/atoms/symbol-view';
import { Text } from '@/components/atoms/text';
import { FailureNotice } from '@/components/molecules/failure-notice';
import { ListRow } from '@/components/molecules/list-row';
import { sizes } from '@/theme';

type UserTagPickerProps = {
  copy: CopyDetails;
  userTags: UserTagRow[];
  changeFailed: boolean;
  onToggle: (userTag: UserTag, tagged: boolean) => void;
  onCreate: (name: string) => void;
  onRename: (userTag: UserTag, name: string) => Promise<UserTagWriteResult>;
  onDelete: (userTag: UserTag) => Promise<UserTagWriteResult>;
};

type RowAction = { userTagId: string; action: 'rename' | 'delete' };

export function UserTagPicker({ copy, userTags, changeFailed, onToggle, onCreate, onRename, onDelete }: UserTagPickerProps) {
  const [text, setText] = useState('');
  const [rowAction, setRowAction] = useState<RowAction | null>(null);
  const name = text.trim();
  const canCreate = name !== '' && !userTags.some((userTag) => matchesUserTagName(userTag, name));
  const userTagIdsOnCopy = new Set(copy.user_tags.map((userTag) => userTag.user_tag_id));

  function create() {
    setText('');
    onCreate(name);
  }
  const actionOn = (userTag: UserTag) => (rowAction?.userTagId === userTag.user_tag_id ? rowAction.action : null);

  return (
    <View className="gap-lg">
      <Text variant="meta">{copyNameLine(copy)}</Text>
      <Input
        accessibilityLabel="Find or create a user tag"
        placeholder="Find or create a user tag"
        maxLength={userTagNameLength}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        returnKeyType="done"
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => canCreate && create()}
      />
      {changeFailed ? <FailureNotice message="Could not change the user tags. Check your connection." /> : null}
      <View className="gap-xs">
        {canCreate ? (
          <ListRow
            leading={<SymbolView name="plus" size={sizes.rowSymbol} className="text-primary" />}
            title={`Create "${name}"`}
            detail="and add it to this copy"
            onPress={create}
          />
        ) : null}
        {userTagsFound(userTags, name).map((userTag) => {
          const checked = userTagIdsOnCopy.has(userTag.user_tag_id);
          const action = actionOn(userTag);
          const close = () => setRowAction(null);
          if (action === 'rename') {
            return <RenameUserTag key={userTag.user_tag_id} userTag={userTag} onRename={onRename} onDone={close} />;
          }
          return (
            <View key={userTag.user_tag_id} className="gap-xs">
              <ListRow
                title={userTag.name}
                detail={shownCopyCount(userTag.copy_count)}
                checked={checked}
                onPress={() => onToggle(userTag, !checked)}
                menu={
                  <MenuButton
                    accessibilityLabel={`More, ${userTag.name}`}
                    actions={[
                      { title: 'Rename', onSelect: () => setRowAction({ userTagId: userTag.user_tag_id, action: 'rename' }) },
                      {
                        title: 'Delete user tag',
                        destructive: true,
                        onSelect: () => setRowAction({ userTagId: userTag.user_tag_id, action: 'delete' }),
                      },
                    ]}
                  />
                }
              />
              {action === 'delete' ? (
                <ConfirmUserTagDelete
                  userTag={userTag}
                  onDelete={async () => {
                    if ((await onDelete(userTag)) !== 'failed') {
                      close();
                    }
                  }}
                  onCancel={close}
                />
              ) : null}
            </View>
          );
        })}
      </View>
      {userTags.length === 0 && !canCreate ? (
        <Text className="text-text-muted">No user tags yet. Type a name to create one.</Text>
      ) : null}
    </View>
  );
}

type RenameUserTagProps = {
  userTag: UserTag;
  onRename: (userTag: UserTag, name: string) => Promise<UserTagWriteResult>;
  onDone: () => void;
};

function RenameUserTag({ userTag, onRename, onDone }: RenameUserTagProps) {
  const [text, setText] = useState(userTag.name);
  const [takenName, setTakenName] = useState<string | null>(null);
  const name = text.trim();
  const canSave = name !== '';

  async function save() {
    if (name === userTag.name) {
      onDone();
      return;
    }
    const result = await onRename(userTag, name);
    setTakenName(result === 'exists' ? name : null);
    if (result === 'done' || result === 'missing') {
      onDone();
    }
  }

  return (
    <View className="gap-xs">
      <View className="flex-row items-center gap-sm">
        <Input
          accessibilityLabel="User tag name"
          maxLength={userTagNameLength}
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus
          returnKeyType="done"
          className="flex-1"
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => canSave && save()}
        />
        <Button variant="primary" disabled={!canSave} onPress={save}>
          <Text>Save</Text>
        </Button>
      </View>
      {takenName ? <FailureNotice message={`You already have a user tag named "${takenName}".`} /> : null}
    </View>
  );
}

type ConfirmUserTagDeleteProps = {
  userTag: UserTagRow;
  onDelete: () => void;
  onCancel: () => void;
};

function ConfirmUserTagDelete({ userTag, onDelete, onCancel }: ConfirmUserTagDeleteProps) {
  return (
    <Surface className="gap-md">
      <Text variant="body-strong">{`Delete "${userTag.name}"? It comes off ${shownCopyCount(userTag.copy_count)}.`}</Text>
      <View className="flex-row gap-sm">
        <Button variant="danger" className="flex-1" onPress={onDelete}>
          <Text>Delete user tag</Text>
        </Button>
        <Button className="flex-1" onPress={onCancel}>
          <Text>Cancel</Text>
        </Button>
      </View>
    </Surface>
  );
}
