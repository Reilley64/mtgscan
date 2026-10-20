CREATE UNLOGGED TABLE "catalog_import"."card_prices" (
  "run_id"            uuid    NOT NULL,
  "batch_number"      integer NOT NULL,
  "printing_id"       uuid,
  "usd_nonfoil_cents" integer,
  "usd_foil_cents"    integer,
  "usd_etched_cents"  integer
);

CREATE INDEX card_prices_run_batch ON catalog_import.card_prices USING btree (run_id, batch_number);

ALTER TABLE "catalog_import"."card_prices"
  OWNER TO "catalog_importer";
