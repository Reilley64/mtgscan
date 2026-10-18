import type { SetCompletion, SetRow } from '@mtgscan/supabase/sets';

export function completionPercent({ owned, size }: SetCompletion) {
  return Math.floor((100 * owned) / size);
}

export function spokenSet({ name, completion }: SetRow) {
  return `${name}, ${completion.any.owned} of ${completion.any.size}, ${completionPercent(completion.any)} percent`;
}

export function setsMatching(sets: SetRow[], text: string) {
  const wanted = text.toLowerCase();
  return sets.filter(
    (set) => set.completion.any.size > 0 && (set.name.toLowerCase().includes(wanted) || set.code.toLowerCase().includes(wanted)),
  );
}
