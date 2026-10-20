CREATE TABLE "public"."combos" (
  "id"                text   NOT NULL,
  "first_oracle_id"   uuid   NOT NULL,
  "second_oracle_id"  uuid   NOT NULL,
  "color_identity"    text[] NOT NULL,
  "produced_features" text[] NOT NULL,
  CONSTRAINT "combos_first_oracle_id_fkey" FOREIGN KEY (first_oracle_id) REFERENCES public.cards(oracle_id),
  CONSTRAINT "combos_pkey" PRIMARY KEY (id),
  CONSTRAINT "combos_second_oracle_id_fkey" FOREIGN KEY (second_oracle_id) REFERENCES public.cards(oracle_id)
);

ALTER TABLE "public"."combos"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."combos"
  ADD COLUMN "bracket_tag" public.combo_bracket_tag NOT NULL;

CREATE INDEX combos_first_oracle_id ON public.combos USING btree (first_oracle_id);

CREATE INDEX combos_second_oracle_id ON public.combos USING btree (second_oracle_id);

CREATE POLICY "Signed-in users read combos" ON "public"."combos"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "The import role writes combos" ON "public"."combos"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."combos" TO "catalog_importer";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."combos" TO "service_role";

REVOKE ALL ON TABLE "public"."combos" FROM "authenticated";

GRANT SELECT ON TABLE "public"."combos" TO "authenticated";

REVOKE ALL ON TABLE "public"."combos" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."combos" TO "postgres";

REVOKE ALL ON TABLE "public"."combos" FROM "anon";
