import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type {
  AddDeckCardRequest,
  ChangeBasicLandRequest,
  CreatedDeck,
  DeckPriority,
  RevertDeckChangesRequest,
} from '@mtgscan/supabase/decks';

import { supabase } from '@/lib/supabase';
import { writeResultOf, type WriteResult } from '@/lib/write-result';

export async function createDeck(name: string): Promise<CreatedDeck | null> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.create_deck, { name });
  return result.status === 'replied' ? result.reply : null;
}

export async function markDeckUsed(deckId: string) {
  await callDatabaseFunction(supabase, databaseFunctions.mark_deck_used, { deck_id: deckId });
}

export async function renameDeck(deckId: string, name: string) {
  return writeResultOf(await callDatabaseFunction(supabase, databaseFunctions.rename_deck, { deck_id: deckId, name }));
}

export async function setDeckPriority(deckId: string, priority: DeckPriority) {
  return writeResultOf(await callDatabaseFunction(supabase, databaseFunctions.set_deck_priority, { deck_id: deckId, priority }));
}

export async function deleteDeck(deckId: string) {
  return writeResultOf(await callDatabaseFunction(supabase, databaseFunctions.delete_deck, { deck_id: deckId }));
}

export async function changeBasicLand(request: ChangeBasicLandRequest): Promise<WriteResult | 'refused'> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.change_basic_land, request);
  if (result.status === 'refused' && result.refusal.code === 'invalid_argument' && result.refusal.field === 'by') {
    return 'refused';
  }
  return writeResultOf(result);
}

type AddDeckCardResult = 'done' | 'not_free' | 'missing' | 'failed';

export async function addDeckCard(request: AddDeckCardRequest): Promise<AddDeckCardResult> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.add_deck_card, request);
  if (result.status === 'replied') {
    return 'done';
  }
  if (result.status === 'failed') {
    return 'failed';
  }
  const { code, field } = result.refusal;
  if (code === 'copy_not_free') {
    return 'not_free';
  }
  return code === 'not_found' && field === 'copy_id' ? 'missing' : 'failed';
}

export async function setDeckCommander(copyId: string, commander: boolean): Promise<WriteResult> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.set_deck_commander, { copy_id: copyId, commander });
  if (result.status === 'refused' && ['copy_not_in_deck', 'commander_limit'].includes(result.refusal.code)) {
    return 'missing';
  }
  return writeResultOf(result);
}

export async function removeDeckCard(copyId: string): Promise<WriteResult> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.remove_deck_card, { copy_id: copyId });
  if (result.status === 'refused' && result.refusal.code === 'copy_not_in_deck') {
    return 'missing';
  }
  return writeResultOf(result);
}

const outdatedPreviewCodes = ['stale_revision', 'revert_blocked', 'protected_copy'];

export async function revertDeckChanges(request: RevertDeckChangesRequest): Promise<WriteResult | 'outdated'> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.revert_deck_changes, request);
  if (result.status === 'refused' && outdatedPreviewCodes.includes(result.refusal.code)) {
    return 'outdated';
  }
  return writeResultOf(result);
}
