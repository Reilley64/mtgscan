CREATE TABLE "public"."cards" (
  "oracle_id"                 uuid                     NOT NULL,
  "name"                      text                     NOT NULL,
  "mana_cost"                 text                     NOT NULL,
  "mana_value"                numeric                  NOT NULL,
  "colors"                    text[]                   NOT NULL,
  "color_identity"            text[]                   NOT NULL,
  "keywords"                  text[]                   NOT NULL,
  "type_line"                 text                     NOT NULL,
  "oracle_text"               text                     NOT NULL,
  "edhrec_rank"               integer,
  "is_game_changer"           boolean,
  "can_be_commander"          boolean                  NOT NULL,
  "released_at"               date                     NOT NULL,
  "absent_since"              timestamp with time zone,
  "has_partner"               boolean,
  "partner_text"              text,
  "partner_with_name"         text,
  "has_choose_a_background"   boolean,
  "has_doctors_companion"     boolean,
  "commander_chooses_a_color" boolean,
  "copy_limit_number"         integer,
  CONSTRAINT "cards_pkey" PRIMARY KEY (oracle_id)
);

ALTER TABLE "public"."cards"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."cards"
  ADD COLUMN "commander_legality" public.commander_legality NOT NULL;

ALTER TABLE "public"."cards"
  ADD COLUMN "copy_limit" public.copy_limit NOT NULL;

ALTER TABLE "public"."cards"
  ADD CONSTRAINT "cards_copy_limit_number" CHECK (((copy_limit = 'number'::public.copy_limit) = (copy_limit_number IS NOT NULL)));

CREATE INDEX cards_edhrec_rank ON public.cards USING btree (edhrec_rank);

CREATE INDEX cards_mana_value ON public.cards USING btree (mana_value);

CREATE INDEX cards_released_at ON public.cards USING btree (released_at);

CREATE POLICY "Signed-in users read cards" ON "public"."cards"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "The import role writes cards" ON "public"."cards"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."cards" TO "catalog_importer";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cards" TO "service_role";

ALTER TABLE "public"."cards"
  ADD COLUMN "name_key" text COLLATE pg_catalog."C" GENERATED ALWAYS AS (private.name_key(name)) STORED;

ALTER TABLE "public"."cards"
  ADD COLUMN "color_bits" smallint GENERATED ALWAYS AS (private.color_bits(colors)) STORED;

ALTER TABLE "public"."cards"
  ADD COLUMN "identity_bits" smallint GENERATED ALWAYS AS (private.color_bits(color_identity)) STORED;

ALTER TABLE "public"."cards"
  ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (private.card_search_vector(name, type_line, oracle_text, keywords)) STORED;

CREATE INDEX cards_keyword_keys ON public.cards USING gin (private.keyword_keys(keywords));

CREATE INDEX cards_name_key_trigrams ON public.cards USING gin (name_key extensions.gin_trgm_ops);

CREATE INDEX cards_name_key ON public.cards USING btree (name_key, oracle_id);

CREATE INDEX cards_search_vector ON public.cards USING gin (search_vector);

REVOKE ALL ON TABLE "public"."cards" FROM "authenticated";

GRANT SELECT ON TABLE "public"."cards" TO "authenticated";

REVOKE ALL ON TABLE "public"."cards" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cards" TO "postgres";

REVOKE ALL ON TABLE "public"."cards" FROM "anon";
