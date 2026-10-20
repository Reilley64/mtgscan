CREATE UNLOGGED TABLE "catalog_import"."card_taggings" (
  "run_id"       uuid    NOT NULL,
  "batch_number" integer NOT NULL,
  "tag_id"       uuid,
  "oracle_id"    uuid
);

CREATE INDEX card_taggings_run_batch ON catalog_import.card_taggings USING btree (run_id, batch_number);

ALTER TABLE "catalog_import"."card_taggings"
  OWNER TO "catalog_importer";
