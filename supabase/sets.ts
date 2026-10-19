import { z } from 'zod';

import { databaseFunction } from './database-function.ts';
import { finish, id, integer, nextCursor } from './fields.ts';

const finishView = z.enum(['any', 'nonfoil', 'foil']);

export type FinishView = z.infer<typeof finishView>;

const setCompletion = z.strictObject({ owned: integer, size: integer });

export type SetCompletion = z.infer<typeof setCompletion>;

const completion = z.strictObject({ any: setCompletion, nonfoil: setCompletion, foil: setCompletion });

const cardSet = z.strictObject({
  code: z.string(),
  name: z.string(),
  icon_svg_uri: z.string(),
  released_at: z.string(),
  set_art_uri: z.string().nullable(),
  completion,
});

export type CardSet = z.infer<typeof cardSet>;

const setListQuery = z.strictObject({
  text: z.string().optional(),
  finish_view: finishView,
  cursor: z.string().nullable().optional(),
  limit: integer.optional(),
});

export type SetListQuery = z.input<typeof setListQuery>;

const setList = z.strictObject({ items: z.array(cardSet), next_cursor: nextCursor });

export type SetList = z.infer<typeof setList>;

const setQuery = z.strictObject({ code: z.string() });

const finishCount = integer.nullable();

const setCardPrinting = z.strictObject({
  printing_id: id,
  name: z.string(),
  collector_number: z.string(),
  image_uri: z.string().nullable(),
  finishes: z.array(finish),
  counts: z.strictObject({ any: finishCount, nonfoil: finishCount, foil: finishCount }),
});

export type SetCardPrinting = z.infer<typeof setCardPrinting>;

const setDetails = cardSet.extend({
  main_set: z.array(setCardPrinting),
  variants: z.strictObject({ completion, card_printings: z.array(setCardPrinting) }),
});

export type SetDetails = z.infer<typeof setDetails>;

export const listSets = databaseFunction({
  name: 'list_sets',
  argument: 'query',
  request: setListQuery,
  reply: setList,
  errorCodes: ['invalid_argument', 'invalid_cursor'],
});

export const getSet = databaseFunction({
  name: 'get_set',
  argument: 'query',
  request: setQuery,
  reply: setDetails,
  errorCodes: ['invalid_argument', 'not_found'],
});
