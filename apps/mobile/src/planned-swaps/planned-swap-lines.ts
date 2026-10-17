import type { PlannedCopyLine, PlannedSwap } from '@mtgscan/supabase/planned-swaps';

import { conditionLabels, finishLabels } from '@/collection/copy-labels';

function printingOf(line: PlannedCopyLine) {
  if (line.set === null) {
    return line.type_line;
  }
  return [
    `${line.set.toUpperCase()} ${line.collector_number}`,
    ...(line.finish && line.finish !== 'nonfoil' ? [finishLabels[line.finish]] : []),
    ...(line.condition && line.condition !== 'near_mint' ? [conditionLabels[line.condition]] : []),
  ].join(' \u00b7 ');
}

function changeLineOf(line: PlannedCopyLine, direction: 'incoming' | 'outgoing', place: string | null = null) {
  return {
    key: `${direction}-${line.copy_id}`,
    direction,
    name: line.name,
    uri: line.image_uris[0],
    detail: [printingOf(line), place].filter((part) => part !== null).join(' \u00b7 '),
  };
}

export function plannedSwapLines(plannedSwap: PlannedSwap) {
  return [
    changeLineOf(plannedSwap.incoming, 'incoming', plannedSwap.as_commander ? 'Commander' : null),
    ...(plannedSwap.outgoing ? [changeLineOf(plannedSwap.outgoing, 'outgoing')] : []),
  ];
}
