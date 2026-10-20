CREATE TYPE "private"."new_planned_swap" AS (
  "index"                 integer,
  "planned_swap_id"       uuid,
  "ref"                   text,
  "deck_id"               uuid,
  "incoming_copy_id"      uuid,
  "incoming_oracle_id"    uuid,
  "as_commander"          boolean,
  "outgoing_copy_id"      uuid,
  "outgoing_oracle_id"    uuid,
  "outgoing_is_commander" boolean,
  "reason"                text
);
