import type { BuylistCard, PlannedCardLine } from '@mtgscan/supabase/buylist';
import type { CardCondition } from '@mtgscan/supabase/collection';
import type { PlannedBasicLandLine, PlannedCopyLine, PlannedSwap } from '@mtgscan/supabase/planned-swaps';
import type { Finish } from '@mtgscan/supabase/search';

import { conditionLabels, finishLabels } from '@/collection/copy-labels';

export type NeedsYouLine = {
  key: string;
  direction: 'incoming' | 'outgoing';
  name: string;
  uri: string | undefined;
  detail: string;
};

type Printing = { set: string; collector_number: string | null; finish: Finish | null; condition: CardCondition | null };

export function printingOf({ set, collector_number, finish, condition }: Printing) {
  return [
    `${set.toUpperCase()} ${collector_number}`,
    ...(finish && finish !== 'nonfoil' ? [finishLabels[finish]] : []),
    ...(condition && condition !== 'near_mint' ? [conditionLabels[condition]] : []),
  ].join(' \u00b7 ');
}

const basicLandDetails: Record<NeedsYouLine['direction'], string> = { incoming: '+1', outgoing: '\u22121' };

function detailOf(line: PlannedCopyLine | PlannedCardLine | PlannedBasicLandLine, direction: NeedsYouLine['direction']) {
  if (line.kind === 'basic_land') {
    return basicLandDetails[direction];
  }
  return line.kind === 'copy' && line.set !== null ? printingOf({ ...line, set: line.set }) : line.type_line;
}

function lineOf(
  line: PlannedCopyLine | PlannedCardLine | PlannedBasicLandLine,
  direction: NeedsYouLine['direction'],
  asCommander = false,
): NeedsYouLine {
  const detail = detailOf(line, direction);
  return {
    key: `${direction}-${line.kind === 'copy' ? line.copy_id : line.oracle_id}`,
    direction,
    name: line.name,
    uri: line.image_uris[0],
    detail: [detail, ...(asCommander ? ['Commander'] : [])].join(' \u00b7 '),
  };
}

export function needsYouLines({ incoming, outgoing, as_commander }: Pick<PlannedSwap | BuylistCard, 'incoming' | 'outgoing' | 'as_commander'>) {
  return [lineOf(incoming, 'incoming', as_commander), ...(outgoing ? [lineOf(outgoing, 'outgoing')] : [])];
}
