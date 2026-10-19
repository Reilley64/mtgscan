import type { DatabaseFunction, DatabaseFunctionResult, ReplyOf } from '@mtgscan/supabase/database-function';

export function replyOf<Contract extends DatabaseFunction>(result: DatabaseFunctionResult<Contract>): ReplyOf<Contract> {
  if (result.status === 'replied') {
    return result.reply;
  }
  throw result.status === 'refused' ? result.refusal : result.error;
}
