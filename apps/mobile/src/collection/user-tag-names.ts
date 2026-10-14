import type { UserTag } from '@mtgscan/supabase/collection';

export function matchesUserTagName(userTag: UserTag, text: string) {
  return userTag.name.toLowerCase() === text.trim().toLowerCase();
}

export function userTagsFound<Row extends UserTag>(userTags: Row[], text: string) {
  const found = text.trim().toLowerCase();
  return userTags.filter((userTag) => userTag.name.toLowerCase().includes(found));
}
