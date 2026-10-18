export type FinishView = 'any';

export type SetCompletion = { owned: number; size: number };

export type SetRow = {
  code: string;
  name: string;
  icon_svg_uri: string;
  released_at: string;
  completion: Record<FinishView, SetCompletion>;
};

export type SetList = { items: SetRow[] };
