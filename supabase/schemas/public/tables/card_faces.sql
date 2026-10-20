CREATE TABLE "public"."card_faces" (
  "oracle_id"   uuid     NOT NULL,
  "face_index"  smallint NOT NULL,
  "name"        text     NOT NULL,
  "mana_cost"   text     NOT NULL,
  "type_line"   text     NOT NULL,
  "oracle_text" text     NOT NULL,
  "colors"      text[]   NOT NULL,
  "power"       text,
  "toughness"   text,
  "loyalty"     text,
  CONSTRAINT "card_faces_pkey" PRIMARY KEY (oracle_id, face_index),
  CONSTRAINT "card_faces_oracle_id_fkey" FOREIGN KEY (oracle_id) REFERENCES public.cards(oracle_id)
);

ALTER TABLE "public"."card_faces"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read card faces" ON "public"."card_faces"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "The import role writes card faces" ON "public"."card_faces"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."card_faces" TO "catalog_importer";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."card_faces" TO "service_role";

REVOKE ALL ON TABLE "public"."card_faces" FROM "authenticated";

GRANT SELECT ON TABLE "public"."card_faces" TO "authenticated";

REVOKE ALL ON TABLE "public"."card_faces" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."card_faces" TO "postgres";

REVOKE ALL ON TABLE "public"."card_faces" FROM "anon";
