import type { CopyDetails, UserTag, UserTagRow } from '@mtgscan/supabase/collection';
import { useState } from 'react';
import { View } from 'react-native';

import { conditionLabels, finishLabels } from '@/collection/copy-labels';
import { shownCopyCount } from '@/collection/total-labels';
import { matchesUserTagName, userTagNameLength, userTagsFound } from '@/collection/user-tags';
import { Input } from '@/components/atoms/input';
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
};

function copyLine(copy: CopyDetails) {
  return [
    copy.name,
    `${copy.set.toUpperCase()} ${copy.collector_number}`,
    ...(copy.finish === 'nonfoil' ? [] : [finishLabels[copy.finish]]),
    conditionLabels[copy.condition],
  ].join(' · ');
}

export function UserTagPicker({ copy, userTags, changeFailed, onToggle, onCreate }: UserTagPickerProps) {
  const [text, setText] = useState('');
  const name = text.trim();
  const canCreate = name !== '' && !userTags.some((userTag) => matchesUserTagName(userTag, name));
  const onCopy = new Set(copy.user_tags.map((userTag) => userTag.user_tag_id));

  return (
    <View className="gap-lg">
      <Text variant="meta">{copyLine(copy)}</Text>
      <Input
        accessibilityLabel="Find or create a user tag"
        placeholder="Find or create a user tag"
        maxLength={userTagNameLength}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        value={text}
        onChangeText={setText}
      />
      {changeFailed ? <FailureNotice message="Could not change the user tags. Check your connection." /> : null}
      <View className="gap-xs">
        {canCreate ? (
          <ListRow
            leading={<SymbolView name="plus" size={sizes.checkMark} className="text-primary" />}
            title={`Create "${name}"`}
            detail="and add it to this copy"
            onPress={() => {
              setText('');
              onCreate(name);
            }}
          />
        ) : null}
        {userTagsFound(userTags, name).map((userTag) => {
          const checked = onCopy.has(userTag.user_tag_id);
          return (
            <ListRow
              key={userTag.user_tag_id}
              title={userTag.name}
              detail={shownCopyCount(userTag.copy_count)}
              checked={checked}
              onPress={() => onToggle(userTag, !checked)}
            />
          );
        })}
      </View>
      {userTags.length === 0 && !canCreate ? (
        <Text className="text-text-muted">No user tags yet. Type a name to create one.</Text>
      ) : null}
    </View>
  );
}
