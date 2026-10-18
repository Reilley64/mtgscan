import {
  readUserTagError,
  type CreateUserTagRequest,
  type DeleteUserTagRequest,
  type RenameUserTagRequest,
  type UserTag,
  type UserTagList,
  type UserTagRow,
} from '@mtgscan/supabase/collection';

import { setCopyUserTag } from '@/collection/copy-writes';
import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';
import { writeResultOf, type WriteResult } from '@/lib/write-result';

export async function readUserTags(): Promise<{ status: 'loaded'; userTags: UserTagRow[] }> {
  const { data, error } = await supabase.rpc('list_user_tags');
  if (error) {
    throw error;
  }
  return { status: 'loaded', userTags: (data as unknown as UserTagList).items };
}

export function useUserTags() {
  return useFocusedRead(readUserTags);
}

export async function createUserTagOnCopy(copyId: string, name: string): Promise<WriteResult> {
  const request: CreateUserTagRequest = { name };
  const { data, error } = await supabase.rpc('create_user_tag', { request });
  if (error) {
    return readUserTagError(error).code === 'user_tag_exists' ? 'done' : 'failed';
  }
  return setCopyUserTag({ copy_id: copyId, user_tag_id: (data as unknown as UserTag).user_tag_id, tagged: true });
}

export type UserTagWriteResult = WriteResult | 'exists';

export async function renameUserTag(request: RenameUserTagRequest): Promise<UserTagWriteResult> {
  const { error } = await supabase.rpc('rename_user_tag', { request });
  return error && readUserTagError(error).code === 'user_tag_exists' ? 'exists' : writeResultOf(error);
}

export async function deleteUserTag(request: DeleteUserTagRequest): Promise<WriteResult> {
  const { error } = await supabase.rpc('delete_user_tag', { request });
  return writeResultOf(error);
}
