import type { Finish } from './search';

export type FinishView = 'any' | 'nonfoil' | 'foil';

export type SetCompletion = { owned: number; size: number };

export type SetRow = {
  code: string;
  name: string;
  icon_svg_uri: string;
  released_at: string;
  set_art_uri: string | null;
  completion: Record<FinishView, SetCompletion>;
};

export type SetList = { items: SetRow[] };

export type SetQuery = { code: string };

export type SetCardPrinting = {
  printing_id: string;
  name: string;
  collector_number: string;
  image_uri: string | null;
  finishes: Finish[];
  counts: Record<FinishView, number | null>;
};

export type SetVariants = {
  completion: Record<FinishView, SetCompletion>;
  card_printings: SetCardPrinting[];
};

export type SetDetails = SetRow & {
  main_set: SetCardPrinting[];
  variants: SetVariants;
};
