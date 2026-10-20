CREATE UNLOGGED TABLE "catalog_import"."oracle_tags" (
  "run_id"       uuid    NOT NULL,
  "batch_number" integer NOT NULL,
  "id"           uuid,
  "slug"         text,
  "label"        text,
  "description"  text,
  "aliases"      text[]
);

CREATE INDEX oracle_tags_run_batch ON catalog_import.oracle_tags USING btree (run_id, batch_number);

ALTER TABLE "catalog_import"."oracle_tags"
  OWNER TO "catalog_importer";
