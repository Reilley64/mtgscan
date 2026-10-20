CREATE TABLE "public"."card_prices" (
  "printing_id"       uuid    NOT NULL,
  "usd_nonfoil_cents" integer,
  "usd_foil_cents"    integer,
  "usd_etched_cents"  integer,
  CONSTRAINT "card_prices_check" CHECK ((num_nonnulls(usd_nonfoil_cents, usd_foil_cents, usd_etched_cents) > 0)),
  CONSTRAINT "card_prices_pkey" PRIMARY KEY (printing_id),
  CONSTRAINT "card_prices_usd_etched_cents_check" CHECK ((usd_etched_cents >= 0)),
  CONSTRAINT "card_prices_usd_foil_cents_check" CHECK ((usd_foil_cents >= 0)),
  CONSTRAINT "card_prices_usd_nonfoil_cents_check" CHECK ((usd_nonfoil_cents >= 0)),
  CONSTRAINT "card_prices_printing_id_fkey" FOREIGN KEY (printing_id) REFERENCES public.card_printings(id)
);

ALTER TABLE "public"."card_prices"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read card prices" ON "public"."card_prices"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "The import role writes card prices" ON "public"."card_prices"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."card_prices" TO "catalog_importer";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."card_prices" TO "service_role";

REVOKE ALL ON TABLE "public"."card_prices" FROM "authenticated";

GRANT SELECT ON TABLE "public"."card_prices" TO "authenticated";

REVOKE ALL ON TABLE "public"."card_prices" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."card_prices" TO "postgres";

REVOKE ALL ON TABLE "public"."card_prices" FROM "anon";
