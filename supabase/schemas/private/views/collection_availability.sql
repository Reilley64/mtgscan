CREATE VIEW "private"."collection_availability" WITH (security_invoker=true) AS  SELECT copy.id AS copy_id,
    copy.user_id,
    copy.card_printing_id,
    printing.oracle_id,
    copy.finish,
    copy.condition,
    copy.language,
    copy.is_protected,
    deck_use.is_allocated,
    deck_use.is_held,
    (NOT (deck_use.is_allocated OR deck_use.is_held)) AS is_free
   FROM ((public.copies copy
     JOIN public.card_printings printing ON ((printing.id = copy.card_printing_id)))
     CROSS JOIN LATERAL ( SELECT (EXISTS ( SELECT 1
                   FROM public.deck_cards deck_card
                  WHERE ((deck_card.user_id = copy.user_id) AND (deck_card.copy_id = copy.id)))) AS is_allocated,
            (EXISTS ( SELECT 1
                   FROM public.planned_swaps swap
                  WHERE ((swap.user_id = copy.user_id) AND (swap.incoming_copy_id = copy.id) AND (swap.status = 'open'::public.planned_swap_status)))) AS is_held) deck_use);

GRANT SELECT ON TABLE "private"."collection_availability" TO "authenticated", "service_role";
