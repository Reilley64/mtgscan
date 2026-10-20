CREATE UNLOGGED TABLE "catalog_import"."card_faces" (
  "run_id"       uuid     NOT NULL,
  "batch_number" integer  NOT NULL,
  "oracle_id"    uuid,
  "face_index"   smallint,
  "name"         text,
  "mana_cost"    text,
  "type_line"    text,
  "oracle_text"  text,
  "colors"       text[],
  "power"        text,
  "toughness"    text,
  "loyalty"      text
);

CREATE INDEX card_faces_run_batch ON catalog_import.card_faces USING btree (run_id, batch_number);

ALTER TABLE "catalog_import"."card_faces"
  OWNER TO "catalog_importer";
