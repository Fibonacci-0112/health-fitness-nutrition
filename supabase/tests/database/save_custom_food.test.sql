-- save_custom_food(): atomic food + servings writes that still obey RLS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

-- A per-serving food with its basis serving, in one call.
select is(
  public.save_custom_food(
    '{"id":"a1000000-0000-0000-0000-000000000001","name":"Protein bar","nutrient_basis":"per_serving",
      "basis_serving_id":"a1000000-0000-0000-0000-000000000002",
      "energy_kcal":210,"protein_g":20,"carbs_g":22,"fat_g":7,"fiber_g":null}'::jsonb,
    '[{"id":"a1000000-0000-0000-0000-000000000002","label":"1 bar","grams":60},
      {"id":"a1000000-0000-0000-0000-000000000003","label":"half bar","grams":30}]'::jsonb),
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'creates a per-serving food and its basis serving atomically');
select is((select owner_id from public.foods where id = 'a1000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'the food is owned by the caller');
select is((select count(*) from public.food_servings where food_id = 'a1000000-0000-0000-0000-000000000001'), 2::bigint,
  'both servings are saved');
select is((select fiber_g from public.foods where id = 'a1000000-0000-0000-0000-000000000001'), null,
  'an omitted nutrient stays unknown (null), not zero');

-- Editing: rename, change a serving, drop another.
select lives_ok($$select public.save_custom_food(
    '{"id":"a1000000-0000-0000-0000-000000000001","name":"Protein bar (choc)","nutrient_basis":"per_serving",
      "basis_serving_id":"a1000000-0000-0000-0000-000000000002","energy_kcal":215,"protein_g":20,"carbs_g":23,"fat_g":7}'::jsonb,
    '[{"id":"a1000000-0000-0000-0000-000000000002","label":"1 bar","grams":62}]'::jsonb)$$,
  'updates an existing food');
select is((select name || ' ' || energy_kcal from public.foods where id = 'a1000000-0000-0000-0000-000000000001'),
  'Protein bar (choc) 215.00', 'the food is updated');
select is((select string_agg(label || '=' || grams, ',') from public.food_servings where food_id = 'a1000000-0000-0000-0000-000000000001'),
  '1 bar=62.000', 'servings are replaced by the submitted list');

-- A basis serving that isn't in the list is rejected.
select throws_ok($$select public.save_custom_food(
    '{"name":"Broken","nutrient_basis":"per_serving","basis_serving_id":"a1000000-0000-0000-0000-0000000000ff",
      "energy_kcal":1,"protein_g":1,"carbs_g":1,"fat_g":1}'::jsonb, '[]'::jsonb)$$,
  '23503', null, 'the basis serving must be one of the food''s servings');

-- Removing a serving that a price uses is refused (it would delete the price).
insert into public.food_prices (food_id, package_amount, package_unit, package_serving_id, price_minor, currency, effective_date)
values ('a1000000-0000-0000-0000-000000000001', 12, 'serving', 'a1000000-0000-0000-0000-000000000002', 1800, 'EUR', '2026-10-01');
select throws_ok($$select public.save_custom_food(
    '{"id":"a1000000-0000-0000-0000-000000000001","name":"Protein bar","nutrient_basis":"per_100g",
      "energy_kcal":350,"protein_g":33,"carbs_g":37,"fat_g":12}'::jsonb, '[]'::jsonb)$$,
  '23503', 'A serving you removed is used by a saved price. Delete that price first.',
  'cannot remove a serving that a price uses');

-- User B cannot overwrite A's food by reusing its id.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select throws_ok($$select public.save_custom_food(
    '{"id":"a1000000-0000-0000-0000-000000000001","name":"Hijacked","nutrient_basis":"per_100g",
      "energy_kcal":1,"protein_g":1,"carbs_g":1,"fat_g":1}'::jsonb, '[]'::jsonb)$$,
  '42501', null, 'another user cannot overwrite the food');

reset role;
select is((select name from public.foods where id = 'a1000000-0000-0000-0000-000000000001'), 'Protein bar (choc)',
  'A''s food is unchanged');
select ok(not has_function_privilege('anon', 'public.save_custom_food(jsonb, jsonb)', 'execute'), 'anon cannot call it');

select * from finish();
rollback;
