CREATE TABLE "public"."training_crops" (
  "crop_id"                      uuid             NOT NULL,
  "accepted"                     boolean          NOT NULL,
  "decision_reasons"             text[]           NOT NULL,
  "top_similarity"               double precision NOT NULL,
  "art_margin"                   double precision,
  "reading_set_code"             text,
  "reading_collector_number"     text,
  "reading_premium_mark"         boolean          NOT NULL,
  "reading_names_saved_printing" boolean          NOT NULL,
  "same_text_twin_count"         integer          NOT NULL,
  "recognizer_version"           text             NOT NULL,
  "feature_print_revision"       integer          NOT NULL,
  "gallery_version"              text             NOT NULL,
  "recognized_printing_id"       uuid             NOT NULL,
  "saved_printing_id"            uuid             NOT NULL,
  "printing_confirmed"           boolean          NOT NULL,
  "policy_version"               integer          NOT NULL,
  CONSTRAINT "training_crops_pkey" PRIMARY KEY (crop_id)
);

ALTER TABLE "public"."training_crops"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."training_crops"
  ADD COLUMN "decision_basis" public.decision_basis;

ALTER TABLE "public"."training_crops"
  ADD COLUMN "printing_change" public.printing_change;

REVOKE ALL ON TABLE "public"."training_crops" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."training_crops" TO "postgres";

REVOKE ALL ON TABLE "public"."training_crops" FROM "service_role";

GRANT SELECT ON TABLE "public"."training_crops" TO "service_role";

REVOKE ALL ON TABLE "public"."training_crops" FROM "anon", "authenticated";
