import { useEffect, useId } from 'react';

let tagsKeepingAwake = new Set<string>();

export const fakeKeepAwake = {
  useKeepAwake: (tag?: string) => {
    const defaultTag = useId();
    const tagOrDefault = tag ?? defaultTag;
    useEffect(() => {
      tagsKeepingAwake = new Set([...tagsKeepingAwake, tagOrDefault]);
      return () => {
        tagsKeepingAwake = new Set([...tagsKeepingAwake].filter((active) => active !== tagOrDefault));
      };
    }, [tagOrDefault]);
  },
};

export function isScreenKeptAwake() {
  return tagsKeepingAwake.size > 0;
}

export function resetFakeKeepAwake() {
  tagsKeepingAwake = new Set();
}
