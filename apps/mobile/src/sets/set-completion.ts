import type { FinishView, SetCardPrinting, SetCompletion, SetRow } from '@mtgscan/supabase/sets';

export function completionPercent({ owned, size }: SetCompletion) {
  return size > 0 ? Math.floor((100 * owned) / size) : null;
}

export function completionShare({ owned, size }: SetCompletion) {
  return size > 0 ? owned / size : 0;
}

export function isComplete({ owned, size }: SetCompletion) {
  return size > 0 && owned === size;
}

export function spokenSet({ name, completion }: SetRow, finishView: FinishView) {
  const { owned, size } = completion[finishView];
  const percent = completionPercent(completion[finishView]);
  return [name, `${owned} of ${size}`, ...(percent === null ? [] : [`${percent} percent`])].join(', ');
}

export function setsMatching(sets: SetRow[], text: string, finishView: FinishView) {
  const wanted = text.toLowerCase();
  return sets.filter(
    (set) =>
      set.completion[finishView].size > 0 && (set.name.toLowerCase().includes(wanted) || set.code.toLowerCase().includes(wanted)),
  );
}

export function inFinishView(printings: SetCardPrinting[], finishView: FinishView) {
  return printings.filter((printing) => printing.counts[finishView] !== null);
}

export function copiesOf({ counts }: SetCardPrinting, finishView: FinishView) {
  return counts[finishView] ?? 0;
}

export function spokenSetCardPrinting(printing: SetCardPrinting, finishView: FinishView) {
  const copies = copiesOf(printing, finishView);
  const ownership = copies === 0 ? ['not owned'] : copies === 1 ? ['owned'] : ['owned', `${copies} copies`];
  return [printing.name, `number ${printing.collector_number}`, ...ownership].join(', ');
}
