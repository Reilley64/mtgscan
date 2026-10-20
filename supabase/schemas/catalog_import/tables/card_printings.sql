CREATE UNLOGGED TABLE "catalog_import"."card_printings" (
  "run_id"           uuid    NOT NULL,
  "batch_number"     integer NOT NULL,
  "id"               uuid,
  "oracle_id"        uuid,
  "set_code"         text,
  "set_name"         text,
  "collector_number" text,
  "lang"             text,
  "released_at"      date,
  "illustration_id"  uuid,
  "image_uris"       text[],
  "art_crop_uri"     text,
  "booster"          boolean,
  "promo"            boolean,
  "variation"        boolean
);

ALTER TABLE "catalog_import"."card_printings"
  ADD COLUMN "finishes" public.card_finish[];

ALTER TABLE "catalog_import"."card_printings"
  ADD COLUMN "rarity" public.card_rarity;

CREATE INDEX card_printings_run_batch ON catalog_import.card_printings USING btree (run_id, batch_number);

ALTER TABLE "catalog_import"."card_printings"
  OWNER TO "catalog_importer";
