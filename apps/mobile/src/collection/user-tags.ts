import {
  type CopyUserTagRequest,
  type CreateUserTagRequest,
  type UserTag,
  type UserTagList,
  type UserTagRow,
} from '@mtgscan/supabase/collection';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

type UserTagsRead = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; userTags: UserTagRow[] };

export const userTagNameLength = 64;

export function matchesUserTagName(userTag: UserTag, text: string) {
  return userTag.name.toLowerCase() === text.trim().toLowerCase();
}

export function userTagsFound(userTags: UserTagRow[], text: string) {
  const found = text.trim().toLowerCase();
  return userTags.filter((userTag) => userTag.name.toLowerCase().includes(found));
}

async function readUserTags(): Promise<UserTagsRead> {
  const { data, error } = await supabase.rpc('list_user_tags');
  return error ? { status: 'failed' } : { status: 'loaded', userTags: (data as unknown as UserTagList).items };
}

export function useUserTags() {
  const [read, setRead] = useState<UserTagsRead>({ status: 'loading' });
  const latestRead = useRef(0);

  const reload = useCallback(() => {
    const thisRead = ++latestRead.current;
    readUserTags().then(
      (next) => thisRead === latestRead.current && setRead(next),
      () => thisRead === latestRead.current && setRead({ status: 'failed' }),
    );
  }, []);

  useFocusEffect(reload);

  return { read, reload };
}

export async function setCopyUserTag(request: CopyUserTagRequest) {
  const { error } = await supabase.rpc('set_copy_user_tag', { request });
  return error === null;
}

export async function createUserTagOnCopy(copyId: string, name: string) {
  const request: CreateUserTagRequest = { name: name.trim() };
  const { data, error } = await supabase.rpc('create_user_tag', { request });
  if (error) {
    return false;
  }
  return setCopyUserTag({ copy_id: copyId, user_tag_id: (data as unknown as UserTag).user_tag_id, tagged: true });
}
