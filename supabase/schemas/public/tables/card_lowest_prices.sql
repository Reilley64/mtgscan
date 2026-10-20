CREATE TABLE "public"."card_lowest_prices" (
  "oracle_id" uuid    NOT NULL,
  "usd_cents" integer NOT NULL,
  CONSTRAINT "card_lowest_prices_pkey" PRIMARY KEY (oracle_id),
  CONSTRAINT "card_lowest_prices_usd_cents_check" CHECK ((usd_cents >= 0)),
  CONSTRAINT "card_lowest_prices_oracle_id_fkey" FOREIGN KEY (oracle_id) REFERENCES public.cards(oracle_id)
);

ALTER TABLE "public"."card_lowest_prices"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."card_lowest_prices"
  ADD COLUMN "finish" public.card_finish NOT NULL;

CREATE POLICY "Signed-in users read lowest card prices" ON "public"."card_lowest_prices"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "The import role writes lowest card prices" ON "public"."card_lowest_prices"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."card_lowest_prices" TO "catalog_importer";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."card_lowest_prices" TO "service_role";

REVOKE ALL ON TABLE "public"."card_lowest_prices" FROM "authenticated";

GRANT SELECT ON TABLE "public"."card_lowest_prices" TO "authenticated";

REVOKE ALL ON TABLE "public"."card_lowest_prices" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."card_lowest_prices" TO "postgres";

REVOKE ALL ON TABLE "public"."card_lowest_prices" FROM "anon";
