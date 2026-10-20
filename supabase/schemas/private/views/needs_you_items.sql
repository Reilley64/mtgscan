CREATE VIEW "private"."needs_you_items" WITH (security_invoker=true) AS  SELECT swap.user_id,
    swap.deck_id
   FROM public.planned_swaps swap
  WHERE (swap.status = 'open'::public.planned_swap_status)
UNION ALL
 SELECT card.user_id,
    card.deck_id
   FROM public.buylist_cards card
  WHERE (card.status = 'open'::public.buylist_card_status);

GRANT SELECT ON TABLE "private"."needs_you_items" TO "authenticated";
