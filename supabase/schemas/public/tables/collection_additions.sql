CREATE TABLE "public"."collection_additions" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "added_at"   timestamp with time zone NOT NULL,
  "copy_count" integer                  NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "collection_additions_copy_count_check" CHECK ((copy_count > 0)),
  CONSTRAINT "collection_additions_pkey" PRIMARY KEY (id),
  CONSTRAINT "collection_additions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  "created_by" uuid                     NOT NULL DEFAULT auth.uid(),
  "updated_by" uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."collection_additions"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."collection_additions"
  ADD COLUMN "source" public.collection_addition_source NOT NULL;

CREATE TRIGGER record_who_changed
  BEFORE INSERT OR UPDATE ON public.collection_additions
  FOR EACH ROW
  EXECUTE FUNCTION private.record_who_changed();

CREATE POLICY "Users read their own additions" ON "public"."collection_additions"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."collection_additions" TO "service_role";

REVOKE ALL ON TABLE "public"."collection_additions" FROM "authenticated";

GRANT SELECT ON TABLE "public"."collection_additions" TO "authenticated";

REVOKE ALL ON TABLE "public"."collection_additions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."collection_additions" TO "postgres";

REVOKE ALL ON TABLE "public"."collection_additions" FROM "anon";
