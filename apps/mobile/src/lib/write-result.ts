import type { DatabaseFunction, DatabaseFunctionResult } from '@mtgscan/supabase/database-function';

export type WriteResult = 'done' | 'missing' | 'failed';

export function writeResultOf<Contract extends DatabaseFunction>(result: DatabaseFunctionResult<Contract>): WriteResult {
  if (result.status === 'replied') {
    return 'done';
  }
  return result.status === 'refused' && result.refusal.code === 'not_found' ? 'missing' : 'failed';
}
