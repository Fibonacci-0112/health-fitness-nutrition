-- Save a custom food and its servings atomically.
--
-- A per-serving food references its basis serving through a deferred foreign
-- key, so the food and that serving must be written in the same transaction,
-- which separate REST calls can't do. This function runs as the caller
-- (SECURITY INVOKER), so every row-level security policy still applies: users
-- can only create or change their own custom foods and servings.
--
-- p_food:     { id?, name, brand?, preparation?, nutrient_basis, basis_serving_id?,
--               density_g_per_ml?, energy_kcal, protein_g, carbs_g, fat_g,
--               fiber_g?, sugar_g?, saturated_fat_g?, sodium_mg? }
-- p_servings: [{ id, label, grams?, ml? }]  (the complete list; omitted servings are removed)

create or replace function public.save_custom_food(p_food jsonb, p_servings jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := coalesce(nullif(p_food ->> 'id', '')::uuid, gen_random_uuid());
  v_keep uuid[];
begin
  if jsonb_typeof(p_servings) is distinct from 'array' then
    raise exception 'p_servings must be a JSON array' using errcode = '22023';
  end if;

  select coalesce(array_agg((s ->> 'id')::uuid), '{}') into v_keep
  from jsonb_array_elements(p_servings) s;

  insert into public.foods (
    id, source, name, brand, preparation, nutrient_basis, basis_serving_id, density_g_per_ml,
    energy_kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, saturated_fat_g, sodium_mg
  ) values (
    v_id, 'custom', p_food ->> 'name', nullif(p_food ->> 'brand', ''),
    coalesce(p_food ->> 'preparation', 'unspecified'), p_food ->> 'nutrient_basis',
    nullif(p_food ->> 'basis_serving_id', '')::uuid, (p_food ->> 'density_g_per_ml')::numeric,
    (p_food ->> 'energy_kcal')::numeric, (p_food ->> 'protein_g')::numeric,
    (p_food ->> 'carbs_g')::numeric, (p_food ->> 'fat_g')::numeric,
    (p_food ->> 'fiber_g')::numeric, (p_food ->> 'sugar_g')::numeric,
    (p_food ->> 'saturated_fat_g')::numeric, (p_food ->> 'sodium_mg')::numeric
  )
  on conflict (id) do update set
    name = excluded.name, brand = excluded.brand, preparation = excluded.preparation,
    nutrient_basis = excluded.nutrient_basis, basis_serving_id = excluded.basis_serving_id,
    density_g_per_ml = excluded.density_g_per_ml, energy_kcal = excluded.energy_kcal,
    protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g,
    fiber_g = excluded.fiber_g, sugar_g = excluded.sugar_g,
    saturated_fat_g = excluded.saturated_fat_g, sodium_mg = excluded.sodium_mg;

  -- Removing a serving would silently delete the prices recorded per that serving.
  if exists (
    select 1 from public.food_prices p
    where p.food_id = v_id and p.package_serving_id is not null and p.package_serving_id <> all (v_keep)
  ) then
    raise exception 'A serving you removed is used by a saved price. Delete that price first.'
      using errcode = '23503';
  end if;

  delete from public.food_servings fs where fs.food_id = v_id and fs.id <> all (v_keep);

  insert into public.food_servings (id, food_id, label, grams, ml)
  select (s ->> 'id')::uuid, v_id, s ->> 'label', (s ->> 'grams')::numeric, (s ->> 'ml')::numeric
  from jsonb_array_elements(p_servings) s
  on conflict (id) do update set label = excluded.label, grams = excluded.grams, ml = excluded.ml
    where public.food_servings.food_id = excluded.food_id;

  -- Surface a bad basis serving now, with the other errors, rather than at commit.
  set constraints public.foods_basis_serving_fk immediate;

  return v_id;
end;
$$;

revoke all on function public.save_custom_food(jsonb, jsonb) from public, anon;
grant execute on function public.save_custom_food(jsonb, jsonb) to authenticated;
