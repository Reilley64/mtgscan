CREATE TABLE "public"."user_tags" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "name"       text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone,
  CONSTRAINT "user_tags_name_check" CHECK (((name !~ '^\s|\s$'::text) AND ((char_length(name) >= 1) AND (char_length(name) <= 64)))),
  CONSTRAINT "user_tags_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "user_tags_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  "created_by" uuid                     NOT NULL DEFAULT auth.uid(),
  "updated_by" uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."user_tags"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX user_tags_name ON public.user_tags USING btree (user_id, lower(name))
  WHERE (deleted_at IS NULL);

CREATE TRIGGER record_who_changed
  BEFORE INSERT OR UPDATE ON public.user_tags
  FOR EACH ROW
  EXECUTE FUNCTION private.record_who_changed();

CREATE POLICY "Users read their own user tags" ON "public"."user_tags"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_tags" TO "service_role";

REVOKE ALL ON TABLE "public"."user_tags" FROM "authenticated";

GRANT SELECT ON TABLE "public"."user_tags" TO "authenticated";

REVOKE ALL ON TABLE "public"."user_tags" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_tags" TO "postgres";

REVOKE ALL ON TABLE "public"."user_tags" FROM "anon";
