CREATE TABLE "public"."copy_user_tags" (
  "user_id"     uuid                     NOT NULL,
  "copy_id"     uuid                     NOT NULL,
  "user_tag_id" uuid                     NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"  timestamp with time zone,
  CONSTRAINT "copy_user_tags_pkey" PRIMARY KEY (user_id, copy_id, user_tag_id),
  CONSTRAINT "copy_user_tags_user_id_copy_id_fkey" FOREIGN KEY (user_id, copy_id) REFERENCES public.copies(user_id, id) ON DELETE CASCADE,
  CONSTRAINT "copy_user_tags_user_id_user_tag_id_fkey" FOREIGN KEY (user_id, user_tag_id) REFERENCES public.user_tags(user_id, id) ON DELETE CASCADE,
  "created_by"  uuid                     NOT NULL DEFAULT auth.uid(),
  "updated_by"  uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."copy_user_tags"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX copy_user_tags_user_tag ON public.copy_user_tags USING btree (user_id, user_tag_id);

CREATE TRIGGER record_who_changed
  BEFORE INSERT OR UPDATE ON public.copy_user_tags
  FOR EACH ROW
  EXECUTE FUNCTION private.record_who_changed();

CREATE POLICY "Users read their own copy user tags" ON "public"."copy_user_tags"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."copy_user_tags" TO "service_role";

REVOKE ALL ON TABLE "public"."copy_user_tags" FROM "authenticated";

GRANT SELECT ON TABLE "public"."copy_user_tags" TO "authenticated";

REVOKE ALL ON TABLE "public"."copy_user_tags" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."copy_user_tags" TO "postgres";

REVOKE ALL ON TABLE "public"."copy_user_tags" FROM "anon";
