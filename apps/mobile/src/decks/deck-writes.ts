import {
  readDeckError,
  type AddDeckCardRequest,
  type ChangeBasicLandRequest,
  type CreateDeckRequest,
  type CreatedDeck,
  type DeckPriority,
  type DeleteDeckRequest,
  type MarkDeckUsedRequest,
  type RemoveDeckCardRequest,
  type RenameDeckRequest,
  type RevertDeckChangesRequest,
  type SetDeckCommanderRequest,
  type SetDeckPriorityRequest,
} from '@mtgscan/supabase/decks';

import { supabase } from '@/lib/supabase';
import { writeResultOf, type WriteResult } from '@/lib/write-result';

export async function createDeck(name: string): Promise<CreatedDeck | null> {
  const request: CreateDeckRequest = { name };
  const { data, error } = await supabase.rpc('create_deck', { request });
  return error ? null : (data as unknown as CreatedDeck);
}

export async function markDeckUsed(deckId: string) {
  const request: MarkDeckUsedRequest = { deck_id: deckId };
  await supabase.rpc('mark_deck_used', { request });
}

export async function renameDeck(deckId: string, name: string) {
  const request: RenameDeckRequest = { deck_id: deckId, name };
  const { error } = await supabase.rpc('rename_deck', { request });
  return writeResultOf(error);
}

export async function setDeckPriority(deckId: string, priority: DeckPriority) {
  const request: SetDeckPriorityRequest = { deck_id: deckId, priority };
  const { error } = await supabase.rpc('set_deck_priority', { request });
  return writeResultOf(error);
}

export async function deleteDeck(deckId: string) {
  const request: DeleteDeckRequest = { deck_id: deckId };
  const { error } = await supabase.rpc('delete_deck', { request });
  return writeResultOf(error);
}

export async function changeBasicLand(request: ChangeBasicLandRequest): Promise<WriteResult | 'refused'> {
  const { error } = await supabase.rpc('change_basic_land', { request });
  if (error && readDeckError(error).code === 'invalid_argument' && readDeckError(error).field === 'by') {
    return 'refused';
  }
  return writeResultOf(error);
}

type AddDeckCardResult = 'done' | 'not_free' | 'missing' | 'failed';

export async function addDeckCard(request: AddDeckCardRequest): Promise<AddDeckCardResult> {
  const { error } = await supabase.rpc('add_deck_card', { request });
  if (!error) {
    return 'done';
  }
  const { code, field } = readDeckError(error);
  if (code === 'copy_not_free') {
    return 'not_free';
  }
  return code === 'not_found' && field === 'copy_id' ? 'missing' : 'failed';
}

export async function setDeckCommander(copyId: string, commander: boolean): Promise<WriteResult> {
  const request: SetDeckCommanderRequest = { copy_id: copyId, commander };
  const { error } = await supabase.rpc('set_deck_commander', { request });
  if (error && ['copy_not_in_deck', 'commander_limit'].includes(readDeckError(error).code)) {
    return 'missing';
  }
  return writeResultOf(error);
}

export async function removeDeckCard(copyId: string): Promise<WriteResult> {
  const request: RemoveDeckCardRequest = { copy_id: copyId };
  const { error } = await supabase.rpc('remove_deck_card', { request });
  if (error && readDeckError(error).code === 'copy_not_in_deck') {
    return 'missing';
  }
  return writeResultOf(error);
}

const outdatedPreviewCodes = ['stale_revision', 'revert_blocked', 'copy_protected'];

export async function revertDeckChanges(request: RevertDeckChangesRequest): Promise<WriteResult | 'outdated'> {
  const { error } = await supabase.rpc('revert_deck_changes', { request });
  if (error && outdatedPreviewCodes.includes(readDeckError(error).code)) {
    return 'outdated';
  }
  return writeResultOf(error);
}
