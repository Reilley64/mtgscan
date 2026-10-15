import { readSearchError } from '@mtgscan/supabase/search';

export type WriteResult = 'done' | 'missing' | 'failed';

export function writeResultOf(error: Parameters<typeof readSearchError>[0] | null): WriteResult {
  if (!error) {
    return 'done';
  }
  return readSearchError(error).code === 'not_found' ? 'missing' : 'failed';
}
