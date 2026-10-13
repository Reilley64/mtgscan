import { Constants } from '@mtgscan/supabase/database.types';
import type { CardCondition, CardLanguage, CurrentPrice } from '@mtgscan/supabase/collection';
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

export function languageCode(language: CardLanguage) {
  return language.toUpperCase();
}

const conditionNames: Record<CardCondition, string> = {
  near_mint: 'near mint',
  lightly_played: 'lightly played',
  moderately_played: 'moderately played',
  heavily_played: 'heavily played',
  damaged: 'damaged',
};

export function shownCondition(condition: CardCondition) {
  return condition === 'near_mint' ? undefined : conditionLabels[condition];
}

export function spokenFinishAndCondition({ finish, condition }: { finish: Finish; condition: CardCondition }) {
  return [
    ...(finish === 'nonfoil' ? [] : [finishLabels[finish].toLowerCase()]),
    ...(condition === 'near_mint' ? [] : [conditionNames[condition]]),
  ];
}

export function shownPrice({ amount, currency }: Pick<CurrentPrice, 'amount' | 'currency'>) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));
}
