CREATE TABLE "public"."import_runs" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "source_updated_at" timestamp with time zone NOT NULL,
  "accept_shrink"     boolean                  NOT NULL DEFAULT false,
  "started_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at"       timestamp with time zone,
  "merge_duration"    interval,
  "counts"            jsonb,
  "failure_reason"    text,
  CONSTRAINT "import_runs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."import_runs"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."import_runs"
  ADD COLUMN "duration" interval GENERATED ALWAYS AS ((finished_at - started_at)) STORED;

ALTER TABLE "public"."import_runs"
  ADD COLUMN "status" public.import_run_status NOT NULL DEFAULT 'running'::public.import_run_status;

ALTER TABLE "public"."import_runs"
  ADD COLUMN "source" public.import_source NOT NULL;

CREATE UNIQUE INDEX import_runs_one_open_run_per_source ON public.import_runs USING btree (source)
  WHERE (status = 'running'::public.import_run_status);

CREATE INDEX import_runs_source_started_at ON public.import_runs USING btree (source, started_at DESC);

CREATE POLICY "The import role writes import runs" ON "public"."import_runs"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."import_runs" TO "catalog_importer";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."import_runs" TO "service_role";

REVOKE ALL ON TABLE "public"."import_runs" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."import_runs" TO "postgres";

REVOKE ALL ON TABLE "public"."import_runs" FROM "anon", "authenticated";
