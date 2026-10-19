import { z } from 'zod';

import { Constants } from './database.types.ts';

const enums = Constants.public.Enums;

export const id = z.guid();

export const integer = z.number().int();

export const nextCursor = z.string().nullable();

export const color = z.enum(['W', 'U', 'B', 'R', 'G']);

export const finish = z.enum(enums.card_finish);

export const rarity = z.enum(enums.card_rarity);

export const condition = z.enum(enums.card_condition);

export const language = z.enum(enums.card_language);

export const commanderLegality = z.enum(enums.commander_legality);

export const comboBracketTag = z.enum(enums.combo_bracket_tag);

export const deckPriority = z.enum(enums.deck_priority);

export const deckRole = z.enum(enums.deck_role);

export const deckValidity = z.enum(enums.deck_validity);

export const deckChangeKind = z.enum(enums.deck_change_kind);

export const plannedSwapStatus = z.enum(enums.planned_swap_status);

export const buylistCardStatus = z.enum(enums.buylist_card_status);

export const closeNote = z.enum(enums.close_note);
