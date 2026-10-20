CREATE TABLE "public"."exchange_rates" (
  "currency"  text    NOT NULL,
  "rate"      numeric NOT NULL,
  "rate_date" date    NOT NULL,
  CONSTRAINT "exchange_rates_currency_check" CHECK ((currency ~ '^[A-Z]{3}$'::text)),
  CONSTRAINT "exchange_rates_pkey" PRIMARY KEY (currency),
  CONSTRAINT "exchange_rates_rate_check" CHECK ((rate > (0)::numeric))
);

ALTER TABLE "public"."exchange_rates"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read exchange rates" ON "public"."exchange_rates"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "The import role writes exchange rates" ON "public"."exchange_rates"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."exchange_rates" TO "catalog_importer";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exchange_rates" TO "service_role";

REVOKE ALL ON TABLE "public"."exchange_rates" FROM "authenticated";

GRANT SELECT ON TABLE "public"."exchange_rates" TO "authenticated";

REVOKE ALL ON TABLE "public"."exchange_rates" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exchange_rates" TO "postgres";

REVOKE ALL ON TABLE "public"."exchange_rates" FROM "anon";
