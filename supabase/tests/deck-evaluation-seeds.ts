import { addDeckCard, changeBasicLand, createDeck, setDeckCommander } from '../decks';
import { basicLand } from './catalog-import-command';
import { replyOf } from './database-calls';
import { asDatabaseOwner, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const forest = basicLand('Forest').oracle_id;

type StoredEvaluation = {
  deck_id: string;
  revision: number;
  catalog_at: Date | null;
  judged_at: Date;
};

export async function scannedCopy(user: TestUser): Promise<string> {
  const scanned = stack(angelicCurator);
  await committed(user, scanBatch([scanned]));
  return scanned.copy_ids[0]!;
}

async function addedCopy(user: TestUser, deckId: string, copyId: string) {
  return replyOf(user.client, addDeckCard, { deck_id: deckId, copy_id: copyId, unprotect: false });
}

export async function deckWithCards(user: TestUser): Promise<string> {
  const { deck_id: deckId } = await replyOf(user.client, createDeck, { name: 'Atraxa' });
  const commander = await scannedCopy(user);
  await addedCopy(user, deckId, commander);
  await replyOf(user.client, setDeckCommander, { copy_id: commander, commander: true });
  await replyOf(user.client, changeBasicLand, { deck_id: deckId, oracle_id: forest, by: 99 });
  return deckId;
}

export async function emptyDeck(user: TestUser): Promise<string> {
  return (await replyOf(user.client, createDeck, { name: 'Kinnan' })).deck_id;
}

export function storedEvaluations(): Promise<StoredEvaluation[]> {
  return asDatabaseOwner(
    (database) => database`
      select deck_id, revision, catalog_at, judged_at
      from public.deck_evaluations
      order by deck_id
    `,
  );
}

export async function storedEvaluation(deckId: string): Promise<StoredEvaluation | undefined> {
  return (await storedEvaluations()).find((evaluation) => evaluation.deck_id === deckId);
}

export async function withFailingRecompute<T>(work: () => Promise<T>): Promise<T> {
  await asDatabaseOwner(async (database) => {
    await database`
      create function public.fail_the_last_deck_evaluation_update()
      returns trigger
      language plpgsql
      as $$
      declare
        updated integer := coalesce(nullif(current_setting('test.deck_evaluation_updates', true), ''), '0')::integer + 1;
      begin
        perform set_config('test.deck_evaluation_updates', updated::text, true);
        if updated = (select count(*) from public.deck_evaluations) then
          raise exception 'Forced deck evaluation failure';
        end if;
        return new;
      end;
      $$
    `;
    await database`
      create trigger fail_the_last_deck_evaluation_update
        before update on public.deck_evaluations
        for each row execute function public.fail_the_last_deck_evaluation_update()
    `;
  });
  try {
    return await work();
  } finally {
    await asDatabaseOwner(async (database) => {
      await database`drop trigger fail_the_last_deck_evaluation_update on public.deck_evaluations`;
      await database`drop function public.fail_the_last_deck_evaluation_update()`;
    });
  }
}

export async function setCatalogSnapshotAt(snapshotAt: string): Promise<void> {
  await asDatabaseOwner(
    (database) => database`update public.import_snapshots set snapshot_at = ${snapshotAt} where source = 'catalog'`,
  );
}

export async function setCatalogSucceededAt(daysAgo: number): Promise<void> {
  await asDatabaseOwner(
    (database) => database`
      update public.import_snapshots set succeeded_at = now() - ${daysAgo} * interval '1 day' where source = 'catalog'
    `,
  );
}
