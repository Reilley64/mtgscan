CREATE UNLOGGED TABLE "catalog_import"."cards" (
  "run_id"                    uuid    NOT NULL,
  "batch_number"              integer NOT NULL,
  "oracle_id"                 uuid,
  "name"                      text,
  "mana_cost"                 text,
  "mana_value"                numeric,
  "colors"                    text[],
  "color_identity"            text[],
  "keywords"                  text[],
  "type_line"                 text,
  "oracle_text"               text,
  "edhrec_rank"               integer,
  "is_game_changer"           boolean,
  "can_be_commander"          boolean,
  "released_at"               date,
  "has_partner"               boolean,
  "partner_text"              text,
  "partner_with_name"         text,
  "has_choose_a_background"   boolean,
  "has_doctors_companion"     boolean,
  "commander_chooses_a_color" boolean,
  "copy_limit_number"         integer
);

ALTER TABLE "catalog_import"."cards"
  ADD COLUMN "commander_legality" public.commander_legality;

ALTER TABLE "catalog_import"."cards"
  ADD COLUMN "copy_limit" public.copy_limit;

CREATE INDEX cards_run_batch ON catalog_import.cards USING btree (run_id, batch_number);

ALTER TABLE "catalog_import"."cards"
  OWNER TO "catalog_importer";
