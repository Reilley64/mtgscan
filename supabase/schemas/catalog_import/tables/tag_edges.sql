CREATE UNLOGGED TABLE "catalog_import"."tag_edges" (
  "run_id"       uuid    NOT NULL,
  "batch_number" integer NOT NULL,
  "parent_id"    uuid,
  "child_id"     uuid
);

CREATE INDEX tag_edges_run_batch ON catalog_import.tag_edges USING btree (run_id, batch_number);

ALTER TABLE "catalog_import"."tag_edges"
  OWNER TO "catalog_importer";
