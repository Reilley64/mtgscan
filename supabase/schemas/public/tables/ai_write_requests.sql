CREATE TABLE "public"."ai_write_requests" (
  "user_id"         uuid                     NOT NULL,
  "idempotency_key" text                     NOT NULL,
  "request"         jsonb                    NOT NULL,
  "result"          jsonb                    NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ai_write_requests_pkey" PRIMARY KEY (user_id, idempotency_key),
  CONSTRAINT "ai_write_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."ai_write_requests"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX ai_write_requests_by_creation ON public.ai_write_requests USING btree (created_at);

REVOKE ALL ON TABLE "public"."ai_write_requests" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ai_write_requests" TO "postgres";

REVOKE ALL ON TABLE "public"."ai_write_requests" FROM "anon", "authenticated", "service_role";
