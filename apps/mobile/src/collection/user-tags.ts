import {
  readUserTagError,
  type CopyUserTagRequest,
  type CreateUserTagRequest,
  type UserTag,
  type UserTagList,
  type UserTagRow,
} from '@mtgscan/supabase/collection';

import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

async function readUserTags(): Promise<{ status: 'failed' } | { status: 'loaded'; userTags: UserTagRow[] }> {
  const { data, error } = await supabase.rpc('list_user_tags');
  return error ? { status: 'failed' } : { status: 'loaded', userTags: (data as unknown as UserTagList).items };
}

export function useUserTags() {
  return useFocusedRead(readUserTags);
}

export async function setCopyUserTag(request: CopyUserTagRequest) {
  const { error } = await supabase.rpc('set_copy_user_tag', { request });
  return error === null;
}

export async function createUserTagOnCopy(copyId: string, name: string) {
  const request: CreateUserTagRequest = { name };
  const { data, error } = await supabase.rpc('create_user_tag', { request });
  if (error) {
    return readUserTagError(error).code === 'user_tag_exists';
  }
  return setCopyUserTag({ copy_id: copyId, user_tag_id: (data as unknown as UserTag).user_tag_id, tagged: true });
}
