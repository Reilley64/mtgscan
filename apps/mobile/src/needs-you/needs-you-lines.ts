import type { BuylistCard, PlannedCardLine } from '@mtgscan/supabase/buylist';
import type { PlannedBasicLandLine, PlannedCopyLine, PlannedSwap } from '@mtgscan/supabase/planned-swaps';

import { printingLabel } from '@/collection/copy-labels';

export type NeedsYouLine = {
  key: string;
  direction: 'incoming' | 'outgoing';
  name: string;
  uri: string | undefined;
  detail: string;
};

function copyDetailOf({ set, collector_number, finish, condition, type_line }: PlannedCopyLine) {
  return set !== null && collector_number !== null && finish !== null && condition !== null
    ? printingLabel({ set, collector_number, finish, condition })
    : type_line;
}

const basicLandDetails: Record<NeedsYouLine['direction'], string> = { incoming: '+1', outgoing: '\u22121' };

function detailOf(line: PlannedCopyLine | PlannedCardLine | PlannedBasicLandLine, direction: NeedsYouLine['direction']) {
  if (line.kind === 'basic_land') {
    return basicLandDetails[direction];
  }
  return line.kind === 'copy' ? copyDetailOf(line) : line.type_line;
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
