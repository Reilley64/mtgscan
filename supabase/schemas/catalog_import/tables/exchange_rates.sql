CREATE UNLOGGED TABLE "catalog_import"."exchange_rates" (
  "run_id"       uuid    NOT NULL,
  "batch_number" integer NOT NULL,
  "currency"     text,
  "rate"         numeric,
  "rate_date"    date
);

CREATE INDEX exchange_rates_run_batch ON catalog_import.exchange_rates USING btree (run_id, batch_number);

ALTER TABLE "catalog_import"."exchange_rates"
  OWNER TO "catalog_importer";
