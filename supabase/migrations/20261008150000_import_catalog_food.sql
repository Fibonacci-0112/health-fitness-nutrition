-- Insert a shared catalog food (e.g. from USDA FoodData Central) with its
-- servings, atomically and idempotently.
--
-- Only the service role may call this: the usda-search Edge Function uses it
-- after fetching and normalizing a food. Shared rows are never writable by
-- signed-in users (see the foods policies). SECURITY INVOKER: the service role
-- already bypasses RLS, and nobody else holds EXECUTE.
--
-- If the (source, source_id) row already exists it is returned unchanged, so
-- repeated imports never duplicate catalog rows or their servings.

create or replace function public.import_catalog_food(p_food jsonb, p_servings jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(p_food ->> 'source', '') = 'custom' or coalesce(p_food ->> 'source_id', '') = '' then
    raise exception 'import_catalog_food is only for catalog sources with a source_id' using errcode = '22023';
  end if;

  insert into public.foods (
    owner_id, source, source_id, name, brand, preparation, nutrient_basis,
    energy_kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, saturated_fat_g, sodium_mg
  ) values (
    null, p_food ->> 'source', p_food ->> 'source_id', p_food ->> 'name', nullif(p_food ->> 'brand', ''),
    coalesce(p_food ->> 'preparation', 'unspecified'), p_food ->> 'nutrient_basis',
    (p_food ->> 'energy_kcal')::numeric, (p_food ->> 'protein_g')::numeric,
    (p_food ->> 'carbs_g')::numeric, (p_food ->> 'fat_g')::numeric,
    (p_food ->> 'fiber_g')::numeric, (p_food ->> 'sugar_g')::numeric,
    (p_food ->> 'saturated_fat_g')::numeric, (p_food ->> 'sodium_mg')::numeric
  )
  on conflict (source, source_id) where source_id is not null do nothing
  returning id into v_id;

  if v_id is null then
    select f.id into v_id from public.foods f
    where f.source = p_food ->> 'source' and f.source_id = p_food ->> 'source_id';
    return v_id;
  end if;

  insert into public.food_servings (food_id, label, grams, ml)
  select v_id, s ->> 'label', (s ->> 'grams')::numeric, (s ->> 'ml')::numeric
  from jsonb_array_elements(coalesce(p_servings, '[]'::jsonb)) s;

  return v_id;
end;
$$;

revoke all on function public.import_catalog_food(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_catalog_food(jsonb, jsonb) to service_role;
