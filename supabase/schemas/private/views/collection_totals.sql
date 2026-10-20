CREATE VIEW "private"."collection_totals" WITH (security_invoker=true) AS  SELECT copy.user_id,
    COALESCE(sum(copy_price.cents), (0)::bigint) AS total_cents,
    (count(copy_price.cents))::integer AS priced_copies,
    (count(*))::integer AS copies
   FROM ((public.copies copy
     LEFT JOIN public.card_prices price ON ((price.printing_id = copy.card_printing_id)))
     CROSS JOIN LATERAL ( SELECT private.finish_price_cents(price.*, copy.finish) AS cents) copy_price)
  GROUP BY copy.user_id;

GRANT SELECT ON TABLE "private"."collection_totals" TO "authenticated";
