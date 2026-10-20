CREATE TABLE "public"."card_printings" (
  "id"               uuid                     NOT NULL,
  "oracle_id"        uuid                     NOT NULL,
  "set_code"         text                     NOT NULL,
  "set_name"         text                     NOT NULL,
  "collector_number" text                     NOT NULL,
  "lang"             text                     NOT NULL,
  "released_at"      date                     NOT NULL,
  "illustration_id"  uuid,
  "image_uris"       text[]                   NOT NULL,
  "absent_since"     timestamp with time zone,
  "art_crop_uri"     text,
  "booster"          boolean                  NOT NULL,
  "promo"            boolean                  NOT NULL,
  "variation"        boolean                  NOT NULL,
  CONSTRAINT "card_printings_pkey" PRIMARY KEY (id),
  CONSTRAINT "card_printings_oracle_id_fkey" FOREIGN KEY (oracle_id) REFERENCES public.cards(oracle_id)
);

ALTER TABLE "public"."card_printings"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."card_printings"
  ADD COLUMN "finishes" public.card_finish[] NOT NULL;

ALTER TABLE "public"."card_printings"
  ADD COLUMN "rarity" public.card_rarity NOT NULL;

CREATE INDEX card_printings_oracle_id ON public.card_printings USING btree (oracle_id);

CREATE INDEX card_printings_set_code ON public.card_printings USING btree (set_code);

CREATE UNIQUE INDEX card_printings_set_collector_number_lang ON public.card_printings USING btree (set_code, collector_number, lang);

CREATE POLICY "Signed-in users read card printings" ON "public"."card_printings"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "The import role writes card printings" ON "public"."card_printings"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."card_printings" TO "catalog_importer";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."card_printings" TO "service_role";

REVOKE ALL ON TABLE "public"."card_printings" FROM "authenticated";

GRANT SELECT ON TABLE "public"."card_printings" TO "authenticated";

REVOKE ALL ON TABLE "public"."card_printings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."card_printings" TO "postgres";

REVOKE ALL ON TABLE "public"."card_printings" FROM "anon";
