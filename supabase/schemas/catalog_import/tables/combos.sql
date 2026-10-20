CREATE UNLOGGED TABLE "catalog_import"."combos" (
  "run_id"            uuid    NOT NULL,
  "batch_number"      integer NOT NULL,
  "id"                text,
  "first_oracle_id"   uuid,
  "second_oracle_id"  uuid,
  "color_identity"    text[],
  "produced_features" text[]
);

ALTER TABLE "catalog_import"."combos"
  ADD COLUMN "bracket_tag" public.combo_bracket_tag;

CREATE INDEX combos_run_batch ON catalog_import.combos USING btree (run_id, batch_number);

ALTER TABLE "catalog_import"."combos"
  OWNER TO "catalog_importer";
