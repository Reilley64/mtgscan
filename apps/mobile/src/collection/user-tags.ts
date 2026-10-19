import type { DeleteUserTagRequest, RenameUserTagRequest, UserTagRow } from '@mtgscan/supabase/collection';
import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';

import { setCopyUserTag } from '@/collection/copy-writes';
import { replyOf } from '@/lib/database-reply';
import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';
import { writeResultOf, type WriteResult } from '@/lib/write-result';

export async function readUserTags(): Promise<{ status: 'loaded'; userTags: UserTagRow[] }> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.list_user_tags);
  return { status: 'loaded', userTags: replyOf(result).items };
}

export function useUserTags() {
  return useFocusedRead(readUserTags);
}

export async function createUserTagOnCopy(copyId: string, name: string): Promise<WriteResult> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.create_user_tag, { name });
  if (result.status !== 'replied') {
    return result.status === 'refused' && result.refusal.code === 'user_tag_exists' ? 'done' : 'failed';
  }
  return setCopyUserTag({ copy_id: copyId, user_tag_id: result.reply.user_tag_id, tagged: true });
}

export type UserTagWriteResult = WriteResult | 'exists';

export async function renameUserTag(request: RenameUserTagRequest): Promise<UserTagWriteResult> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.rename_user_tag, request);
  return result.status === 'refused' && result.refusal.code === 'user_tag_exists' ? 'exists' : writeResultOf(result);
}

export async function deleteUserTag(request: DeleteUserTagRequest): Promise<WriteResult> {
  return writeResultOf(await callDatabaseFunction(supabase, databaseFunctions.delete_user_tag, request));
}
