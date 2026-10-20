CREATE TABLE "public"."import_snapshots" (
  "snapshot_at"  timestamp with time zone NOT NULL,
  "succeeded_at" timestamp with time zone NOT NULL,
  "run_id"       uuid                     NOT NULL,
  CONSTRAINT "import_snapshots_run_id_fkey" FOREIGN KEY (run_id) REFERENCES public.import_runs(id)
);

ALTER TABLE "public"."import_snapshots"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."import_snapshots"
  ADD COLUMN "source" public.import_source NOT NULL;

ALTER TABLE "public"."import_snapshots"
  ADD CONSTRAINT "import_snapshots_pkey" PRIMARY KEY (source);

CREATE POLICY "The deck evaluation role reads import snapshots" ON "public"."import_snapshots"
  FOR SELECT
  TO "deck_evaluator"
  USING (true);

CREATE POLICY "The import role writes import snapshots" ON "public"."import_snapshots"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."import_snapshots" TO "catalog_importer";

GRANT SELECT ON TABLE "public"."import_snapshots" TO "deck_evaluator";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."import_snapshots" TO "service_role";

REVOKE ALL ON TABLE "public"."import_snapshots" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."import_snapshots" TO "postgres";

REVOKE ALL ON TABLE "public"."import_snapshots" FROM "anon", "authenticated";
