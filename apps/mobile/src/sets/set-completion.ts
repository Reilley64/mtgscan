import type { CardSet, FinishView, SetCardPrinting, SetCompletion } from '@mtgscan/supabase/sets';

export type ShownCompletion = SetCompletion & {
  count: string;
  share: number;
  percent: number | null;
  complete: boolean;
};

export function shownCompletion({ owned, size }: SetCompletion): ShownCompletion {
  return {
    owned,
    size,
    count: `${owned} of ${size}`,
    share: size > 0 ? owned / size : 0,
    percent: size > 0 ? Math.floor((100 * owned) / size) : null,
    complete: size > 0 && owned === size,
  };
}

export function setCompletionIn(set: CardSet, finishView: FinishView) {
  return shownCompletion(set.completion[finishView]);
}

export function spokenSet(name: string, { count, percent }: ShownCompletion) {
  return [name, count, ...(percent === null ? [] : [`${percent} percent`])].join(', ');
}

export function setsMatching(sets: CardSet[], text: string, finishView: FinishView) {
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
