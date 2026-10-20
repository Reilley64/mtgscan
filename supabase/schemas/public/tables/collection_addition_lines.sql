CREATE TABLE "public"."collection_addition_lines" (
  "addition_id"            uuid                     NOT NULL,
  "user_id"                uuid                     NOT NULL,
  "card_printing_id"       uuid                     NOT NULL,
  "quantity"               integer                  NOT NULL,
  "purchase_day_usd_cents" integer,
  "price_snapshot_at"      timestamp with time zone,
  CONSTRAINT "collection_addition_lines_card_printing_id_fkey" FOREIGN KEY (card_printing_id) REFERENCES public.card_printings(id),
  CONSTRAINT "collection_addition_lines_purchase_day_usd_cents_check" CHECK ((purchase_day_usd_cents >= 0)),
  CONSTRAINT "collection_addition_lines_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "collection_addition_lines_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "collection_addition_lines_addition_id_fkey" FOREIGN KEY (addition_id) REFERENCES public.collection_additions(id) ON DELETE CASCADE
);

ALTER TABLE "public"."collection_addition_lines"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."collection_addition_lines"
  ADD COLUMN "condition" public.card_condition NOT NULL;

ALTER TABLE "public"."collection_addition_lines"
  ADD COLUMN "finish" public.card_finish NOT NULL;

ALTER TABLE "public"."collection_addition_lines"
  ADD COLUMN "language" public.card_language NOT NULL;

ALTER TABLE "public"."collection_addition_lines"
  ADD CONSTRAINT "collection_addition_lines_pkey" PRIMARY KEY (addition_id, card_printing_id, finish, condition, LANGUAGE);

CREATE INDEX collection_addition_lines_user_id ON public.collection_addition_lines USING btree (user_id);

CREATE POLICY "Users read their own addition lines" ON "public"."collection_addition_lines"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."collection_addition_lines" TO "service_role";

REVOKE ALL ON TABLE "public"."collection_addition_lines" FROM "authenticated";

GRANT SELECT ON TABLE "public"."collection_addition_lines" TO "authenticated";

REVOKE ALL ON TABLE "public"."collection_addition_lines" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."collection_addition_lines" TO "postgres";

REVOKE ALL ON TABLE "public"."collection_addition_lines" FROM "anon";
