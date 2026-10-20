CREATE TABLE "public"."set_section_card_printings" (
  "set_code"         text    NOT NULL,
  "position"         integer NOT NULL,
  "card_printing_id" uuid    NOT NULL,
  CONSTRAINT "set_section_card_printings_card_printing_id_fkey" FOREIGN KEY (card_printing_id) REFERENCES public.card_printings(id),
  CONSTRAINT "set_section_card_printings_pkey" PRIMARY KEY (set_code, "position", card_printing_id),
  CONSTRAINT "set_section_card_printings_set_code_position_fkey" FOREIGN KEY (set_code, "position") REFERENCES public.set_sections(set_code, "position") ON DELETE CASCADE
);

ALTER TABLE "public"."set_section_card_printings"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX set_section_card_printings_card_printing_id ON public.set_section_card_printings USING btree (card_printing_id);

CREATE POLICY "Signed-in users read set section card printings" ON "public"."set_section_card_printings"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "The import role writes set section card printings" ON "public"."set_section_card_printings"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."set_section_card_printings" TO "catalog_importer";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."set_section_card_printings" TO "service_role";

REVOKE ALL ON TABLE "public"."set_section_card_printings" FROM "authenticated";

GRANT SELECT ON TABLE "public"."set_section_card_printings" TO "authenticated";

REVOKE ALL ON TABLE "public"."set_section_card_printings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."set_section_card_printings" TO "postgres";

REVOKE ALL ON TABLE "public"."set_section_card_printings" FROM "anon";
