CREATE TABLE "public"."search_telemetry" (
  "search_id"    uuid                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "user_id"      uuid,
  "query"        jsonb                    NOT NULL,
  "result_count" integer                  NOT NULL,
  "latency_ms"   double precision         NOT NULL,
  "result_ids"   uuid[]                   NOT NULL,
  CONSTRAINT "search_telemetry_pkey" PRIMARY KEY (search_id),
  CONSTRAINT "search_telemetry_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."search_telemetry"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."search_telemetry"
  ADD COLUMN "api" public.search_api NOT NULL;

ALTER TABLE "public"."search_telemetry"
  ADD COLUMN "caller" public.search_caller NOT NULL;

ALTER TABLE "public"."search_telemetry"
  ADD CONSTRAINT "search_telemetry_user_matches_caller" CHECK (((caller = 'release_check'::public.search_caller) = (user_id IS NULL)));

CREATE INDEX search_telemetry_created_at ON public.search_telemetry USING btree (created_at);

CREATE POLICY "The import role deletes telemetry older than 180 days" ON "public"."search_telemetry"
  FOR DELETE
  TO "catalog_importer"
  USING ((created_at < (now() - '180 days'::interval)));

CREATE POLICY "The import role reads telemetry older than 180 days" ON "public"."search_telemetry"
  FOR SELECT
  TO "catalog_importer"
  USING ((created_at < (now() - '180 days'::interval)));

GRANT SELECT ("created_at") ON TABLE "public"."search_telemetry" TO "catalog_importer";

GRANT DELETE ON TABLE "public"."search_telemetry" TO "catalog_importer";

REVOKE ALL ON TABLE "public"."search_telemetry" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."search_telemetry" TO "postgres";

REVOKE ALL ON TABLE "public"."search_telemetry" FROM "service_role";

GRANT SELECT ON TABLE "public"."search_telemetry" TO "service_role";

REVOKE ALL ON TABLE "public"."search_telemetry" FROM "anon", "authenticated";
