import type { UserTag } from '@mtgscan/supabase/collection';

export function matchesUserTagName(userTag: UserTag, text: string) {
  return userTag.name.toLowerCase() === text.trim().toLowerCase();
}

export function userTagsFound<Row extends Pick<UserTag, 'name'>>(userTags: Row[], text: string) {
  const found = text.trim().toLowerCase();
  return userTags.filter((userTag) => userTag.name.toLowerCase().includes(found));
}

export function userTagSuggestionMatches<Row extends Pick<UserTag, 'name'>>(userTags: Row[], text: string) {
  return userTagsFound(userTags, text).slice(0, 8);
}
