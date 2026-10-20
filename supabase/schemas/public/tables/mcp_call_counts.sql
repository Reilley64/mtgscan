CREATE TABLE "public"."mcp_call_counts" (
  "user_id"      uuid                     NOT NULL,
  "period"       text                     NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "count"        integer                  NOT NULL,
  CONSTRAINT "mcp_call_counts_period_check" CHECK ((period = 'minute'::text)),
  CONSTRAINT "mcp_call_counts_pkey" PRIMARY KEY (user_id, period, period_start),
  CONSTRAINT "mcp_call_counts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."mcp_call_counts"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."mcp_call_counts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."mcp_call_counts" TO "postgres";

REVOKE ALL ON TABLE "public"."mcp_call_counts" FROM "anon", "authenticated", "service_role";
