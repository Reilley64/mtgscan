CREATE TABLE "public"."gallery_versions" (
  "version"              text                     NOT NULL,
  "manifest"             jsonb                    NOT NULL,
  "uploaded_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "parity_lowest_cosine" double precision,
  "parity_mean_cosine"   double precision,
  "parity_references"    integer,
  "parity_checked_at"    timestamp with time zone,
  "published_at"         timestamp with time zone,
  CONSTRAINT "gallery_versions_pkey" PRIMARY KEY (VERSION),
  CONSTRAINT "gallery_versions_version_check" CHECK ((version ~ '^[0-9]{8}-[0-9a-f]{6}$'::text))
);

ALTER TABLE "public"."gallery_versions"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."gallery_versions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gallery_versions" TO "postgres";

REVOKE ALL ON TABLE "public"."gallery_versions" FROM "service_role";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER ON TABLE "public"."gallery_versions" TO "service_role";

REVOKE ALL ON TABLE "public"."gallery_versions" FROM "anon", "authenticated";
