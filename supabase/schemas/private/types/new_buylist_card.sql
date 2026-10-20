CREATE TYPE "private"."new_buylist_card" AS (
  "index"                 integer,
  "buylist_card_id"       uuid,
  "ref"                   text,
  "deck_id"               uuid,
  "incoming_oracle_id"    uuid,
  "as_commander"          boolean,
  "outgoing_copy_id"      uuid,
  "outgoing_oracle_id"    uuid,
  "outgoing_is_commander" boolean,
  "reason"                text
);
