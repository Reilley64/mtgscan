import { Constants } from '@mtgscan/supabase/database.types';
import type { CardCondition, CardLanguage } from '@mtgscan/supabase/collection';
import type { Finish } from '@mtgscan/supabase/search';

export const finishes = Constants.public.Enums.card_finish;
export const conditions = Constants.public.Enums.card_condition;
export const languages = Constants.public.Enums.card_language;

export const finishLabels: Record<Finish, string> = {
  nonfoil: 'Nonfoil',
  foil: 'Foil',
  etched: 'Etched',
};

export const conditionLabels: Record<CardCondition, string> = {
  near_mint: 'NM',
  lightly_played: 'LP',
  moderately_played: 'MP',
  heavily_played: 'HP',
  damaged: 'DMG',
};

export const languageNames: Record<CardLanguage, string> = {
  en: 'English',
  ja: 'Japanese',
  de: 'German',
  fr: 'French',
  it: 'Italian',
  es: 'Spanish',
  pt: 'Portuguese',
  ko: 'Korean',
  ru: 'Russian',
  zhs: 'Simplified Chinese',
  zht: 'Traditional Chinese',
};

export function finishDetails(finish: Finish) {
  return finish === 'nonfoil' ? [] : [finishLabels[finish]];
}

function conditionDetails(condition: CardCondition) {
  return condition === 'near_mint' ? [] : [conditionLabels[condition]];
}

export function finishAndConditionLabels({ finish, condition }: { finish: Finish; condition: CardCondition }) {
  return [...finishDetails(finish), ...conditionDetails(condition)];
}
