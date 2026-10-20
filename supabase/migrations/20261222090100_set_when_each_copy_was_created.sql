alter table public.copies disable trigger record_who_changed;

update public.copies copy
  set
    created_at = addition.added_at,
    updated_at = case when copy.updated_at = copy.created_at then addition.added_at else copy.updated_at end
  from public.collection_additions addition
  where addition.id = copy.addition_id;

alter table public.copies enable trigger record_who_changed;
