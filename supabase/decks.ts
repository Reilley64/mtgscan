import type { CollectionCopyRow } from './collection';
import type { Database } from './database.types';
import { readSearchError, type Color, type ComboBracketTag, type SearchError } from './search';

export type DeckPriority = Database['public']['Enums']['deck_priority'];

export type DeckRole = Database['public']['Enums']['deck_role'];

export const deckNameLength = 64;

export type DeckCommander = {
  copy_id: string;
  name: string;
  art_crop_uri: string | null;
};

export type DeckValidity = Database['public']['Enums']['deck_validity'];

export type DeckRule = 'no_commander' | 'commander_eligibility' | 'partner' | 'deck_size' | 'singleton' | 'color_identity' | 'banned' | 'not_legal';

export type UndeterminedRule = DeckRule | 'legality';

export type DeckEvaluationCopy = {
  kind: 'copy';
  copy_id: string;
  name: string;
  image_uris: string[];
};

export type DeckEvaluationBasicLand = {
  kind: 'basic_land';
  oracle_id: string;
  name: string;
  image_uris: string[];
};

export type DeckEvaluationCard = DeckEvaluationCopy | DeckEvaluationBasicLand;

export type Violation = {
  rule: DeckRule;
  citation: string | null;
  message: string;
  hint: string | null;
  cards: DeckEvaluationCard[];
  colors?: Color[];
};

export type UndeterminedCheck = {
  rule: UndeterminedRule;
  reason: string;
  cards: DeckEvaluationCard[];
};

export type EstimatedBracket = 2 | 3 | 4;

export type DeckCombo = {
  cards: DeckEvaluationCard[];
  produced_features: string[];
  bracket_tag: ComboBracketTag;
};

type BracketSignalFields = {
  source: 'official' | 'heuristic';
  count: number;
  lowest_bracket: EstimatedBracket;
  cards: DeckEvaluationCard[];
};

export type BracketSignal =
  | (BracketSignalFields & { kind: 'game_changers' | 'mass_land_denial' | 'extra_turns' })
  | (BracketSignalFields & { kind: 'two_card_combo'; combos: DeckCombo[] });

export type BracketSignalKind = BracketSignal['kind'];

export type DeckEvaluationSummary = {
  validity: DeckValidity;
  validity_stale: boolean;
  estimated_bracket: EstimatedBracket;
  bracket_stale: boolean;
};

export type DeckEvaluation = DeckEvaluationSummary & {
  violations: Violation[];
  undetermined: UndeterminedCheck[];
  chosen_color: Color | null;
  bracket_signals: BracketSignal[];
  missing_signal_count: number;
  revision: number;
  catalog_at: string | null;
  oracle_tags_at: string | null;
  commander_spellbook_at: string | null;
  judged_at: string;
  validity_rules_data_at: string | null;
  bracket_rules_data_at: string | null;
  no_oracle_tag_data: boolean;
  no_combo_data: boolean;
};

export type DeckRow = {
  deck_id: string;
  name: string;
  priority: DeckPriority;
  card_count: number;
  commanders: DeckCommander[];
  last_used_at: string;
  evaluation: DeckEvaluationSummary | null;
};

export type DeckList = {
  items: DeckRow[];
};

export type DeckCard = Omit<CollectionCopyRow, 'deck'> & {
  role: DeckRole;
  commander_at: string | null;
  added_at: string;
  type_line: string;
  mana_value: number;
  colors: Color[];
};

export type DeckBasicLand = {
  oracle_id: string | null;
  name: string;
  image_uris: string[];
  count: number;
};

export type Deck = Omit<DeckRow, 'evaluation'> & {
  evaluation: DeckEvaluation | null;
  revision: number;
  created_at: string;
  cards: DeckCard[];
  basic_lands: DeckBasicLand[];
};

export type CopyRowDeck = {
  deck_id: string;
  name: string;
};

export type CopyDeck = CopyRowDeck & {
  role: DeckRole;
  commander_art_crop_uri: string | null;
  commander_count: number;
};

export type DeckChangeKind = Database['public']['Enums']['deck_change_kind'];

export type DeckChangesQuery = {
  deck_id: string;
  cursor?: string | null;
  limit?: number;
};

export type DeckChangeCopyLine = {
  kind: 'copy';
  copy_id: string;
  name: string;
  image_uris: string[];
  type_line: string;
  place_before: DeckRole | null;
  place_after: DeckRole | null;
};

export type DeckChangeBasicLandLine = {
  kind: 'basic_land';
  oracle_id: string;
  name: string;
  image_uris: string[];
  count_before: number;
  count_after: number;
};

export type DeckChangeLine = DeckChangeCopyLine | DeckChangeBasicLandLine;

export type DeckChange = {
  deck_change_id: string;
  revision: number;
  kind: DeckChangeKind;
  changed_at: string;
  reverted: boolean;
  lines: DeckChangeLine[];
};

export type DeckChangePage = {
  items: DeckChange[];
  next_cursor: string | null;
};

export type CreateDeckRequest = {
  name: string;
};

export type CreatedDeck = {
  deck_id: string;
};

export type DeckQuery = {
  deck_id: string;
};

export type MarkDeckUsedRequest = {
  deck_id: string;
};

export type RenameDeckRequest = {
  deck_id: string;
  name: string;
};

export type SetDeckPriorityRequest = {
  deck_id: string;
  priority: DeckPriority;
};

export type DeleteDeckRequest = {
  deck_id: string;
};

export type AddDeckCardRequest = {
  deck_id: string;
  copy_id: string;
  unprotect: boolean;
};

export type AddedDeckCard = {
  deck_id: string;
  revision: number;
};

export type SetDeckCommanderRequest = {
  copy_id: string;
  commander: boolean;
};

export type SetDeckCommanderResult = AddedDeckCard;

export type BasicLandCount = {
  oracle_id: string;
  count: number;
};

export type SetBasicLandsRequest = {
  deck_id: string;
  counts: BasicLandCount[];
};

export type SetBasicLandsResult = AddedDeckCard;

export type RemoveDeckCardRequest = {
  copy_id: string;
};

export type RemovedDeckCard = AddedDeckCard;

export type RevertPreviewQuery = {
  deck_id: string;
  deck_change_id: string;
};

export type RevertBlock = {
  copy_id: string;
  name: string;
  deck: CopyRowDeck | null;
};

export type RevertProtectedCopy = {
  copy_id: string;
  name: string;
};

export type DeckChangeEffectRule = Pick<Violation, 'rule' | 'colors'>;

export type DeckChangeEffect = {
  kind: 'would_make_invalid' | 'adds_violation';
  rules: DeckChangeEffectRule[];
};

export type RevertPreview = {
  revision: number;
  lines: DeckChangeLine[];
  blocks: RevertBlock[];
  protected_copies: RevertProtectedCopy[];
  effect: DeckChangeEffect | null;
};

export type AddDeckCardPreviewQuery = {
  copy_id: string;
};

export type AddDeckCardPreview = {
  items: { deck_id: string; effect: DeckChangeEffect | null }[];
};

export type RevertDeckChangesRequest = RevertPreviewQuery & {
  expected_revision: number;
  unprotect: boolean;
};

export type RevertedDeckChanges = AddedDeckCard;

export type DeckSuggestionOutgoing = { copy_id: string } | { basic_land_oracle_id: string };

export type DeckSuggestionInput = {
  ref: string;
  deck_id: string;
  expected_deck_revision: number;
  incoming: { oracle_id: string; as_commander?: boolean; from_deck_id?: string };
  outgoing?: DeckSuggestionOutgoing;
  reason: string;
  pair_with?: string;
};

export type CreateDeckSuggestionsRequest = {
  idempotency_key: string;
  suggestions: DeckSuggestionInput[];
};

export type DeckSuggestionWarning =
  | { code: 'would_break_validity'; effect: DeckChangeEffect }
  | { code: 'protected_only' | 'not_owned' | 'replaces_commander' | 'rules_stale' }
  | { code: 'in_other_decks'; decks: { deck_id: string; name: string; priority: DeckPriority }[] }
  | { code: 'against_deck_priority'; from_deck_priority: DeckPriority; deck_priority: DeckPriority };

export type CreatedDeckSuggestion = {
  ref: string;
  suggestion_id: string;
  paired_suggestion_id: string | null;
  warnings: DeckSuggestionWarning[];
};

export type CreatedDeckSuggestions = {
  suggestions: CreatedDeckSuggestion[];
  replayed: boolean;
};

export type DeckErrorCode =
  | 'invalid_argument'
  | 'invalid_cursor'
  | 'not_found'
  | 'copy_not_free'
  | 'copy_protected'
  | 'copy_not_in_deck'
  | 'commander_limit'
  | 'stale_revision'
  | 'revert_blocked';

export type DeckError = Omit<SearchError, 'code'> & { code: DeckErrorCode };

export function readDeckError(error: Parameters<typeof readSearchError>[0]): DeckError {
  return { ...readSearchError(error), code: error.code as DeckErrorCode };
}
