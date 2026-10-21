alter table public.training_crops rename column feature_print_revision to feature_print_model;

alter table public.training_crops alter column feature_print_model type text using 'apple-vision-2';

create or replace function private.checked_training_crop(copy_id uuid, crop jsonb)
returns public.training_crops
language plpgsql
stable
set search_path = ''
as $$
declare
  fields text[] := array[
    'crop_id', 'accepted', 'decision_basis', 'decision_reasons', 'top_similarity', 'art_margin',
    'reading_set_code', 'reading_collector_number', 'reading_premium_mark', 'reading_names_saved_printing',
    'same_text_twin_count', 'recognizer_version', 'feature_print_model', 'gallery_version',
    'recognized_printing_id', 'saved_printing_id', 'printing_change', 'printing_confirmed', 'policy_version'
  ];
  nullable_fields text[] := array['decision_basis', 'art_margin', 'reading_set_code', 'reading_collector_number', 'printing_change'];
  key text;
  member jsonb;
  field text;
  reason_index integer;
begin
  if jsonb_typeof(crop) is distinct from 'object' then
    perform private.invalid_argument('crop', 'crop must be a JSON object.');
  end if;

  for key, member in select entry.key, entry.value from jsonb_each(crop) as entry order by entry.key loop
    field := 'crop.' || key;
    if not key = any (fields) then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    continue when jsonb_typeof(member) = 'null' and key = any (nullable_fields);
    perform case key
      when 'crop_id' then private.checked_uuid(field, member)
      when 'accepted' then private.checked_boolean(field, member)
      when 'decision_basis' then private.checked_choice(field, member, enum_range(null::public.decision_basis)::text[])
      when 'decision_reasons' then private.checked_list(field, member, 1, 10)
      when 'top_similarity' then private.checked_number(field, member, -1, 1)
      when 'art_margin' then private.checked_number(field, member, -2, 2)
      when 'reading_set_code' then private.checked_text(field, member, 10)
      when 'reading_collector_number' then private.checked_text(field, member, 20)
      when 'reading_premium_mark' then private.checked_boolean(field, member)
      when 'reading_names_saved_printing' then private.checked_boolean(field, member)
      when 'same_text_twin_count' then private.checked_integer(field, member, 0, 1000)
      when 'recognizer_version' then private.checked_text(field, member, 50)
      when 'feature_print_model' then private.checked_text(field, member, 50)
      when 'gallery_version' then private.checked_text(field, member, 50)
      when 'recognized_printing_id' then private.checked_card_printing_id(field, member)
      when 'saved_printing_id' then private.checked_card_printing_id(field, member)
      when 'printing_change' then private.checked_choice(field, member, enum_range(null::public.printing_change)::text[])
      when 'printing_confirmed' then private.checked_boolean(field, member)
      when 'policy_version' then private.checked_integer(field, member, 1, 1000)
    end;
    if key = 'decision_reasons' then
      for reason_index in 0 .. jsonb_array_length(member) - 1 loop
        perform private.checked_text(format('%s[%s]', field, reason_index), member -> reason_index, 500);
      end loop;
    end if;
  end loop;

  foreach key in array fields loop
    if not crop ? key then
      field := 'crop.' || key;
      perform private.invalid_argument(field, format('%s is required.', field));
    end if;
  end loop;

  if (crop ->> 'crop_id')::uuid = copy_id then
    perform private.invalid_argument('crop.crop_id', 'crop.crop_id must be a new ID, not the copy ID.');
  end if;
  if (crop ->> 'accepted')::boolean <> (jsonb_typeof(crop -> 'decision_basis') = 'string') then
    perform private.invalid_argument('crop.decision_basis', 'crop.decision_basis must name the basis of an accept, and be null for an abstain.');
  end if;
  return jsonb_populate_record(null::public.training_crops, crop);
end;
$$;
