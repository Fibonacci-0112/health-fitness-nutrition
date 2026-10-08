-- import_catalog_food(): service-role-only, idempotent catalog imports.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'c1@example.com');

select ok(not has_function_privilege('authenticated', 'public.import_catalog_food(jsonb, jsonb)', 'execute'),
  'signed-in users cannot call it');
select ok(not has_function_privilege('anon', 'public.import_catalog_food(jsonb, jsonb)', 'execute'), 'anon cannot call it');
select ok(has_function_privilege('service_role', 'public.import_catalog_food(jsonb, jsonb)', 'execute'), 'the service role can');

set local role service_role;
create temporary table _ids (n int, id uuid) on commit drop;

insert into _ids select 1, public.import_catalog_food(
  '{"source":"usda","source_id":"172676","name":"Bread, oat bran","nutrient_basis":"per_100g",
    "energy_kcal":236,"protein_g":10.4,"carbs_g":39.8,"fat_g":4.4,"fiber_g":4.5,"sodium_mg":353}'::jsonb,
  '[{"label":"1 oz","grams":28.35},{"label":"1 slice","grams":30}]'::jsonb);
insert into _ids select 2, public.import_catalog_food(
  '{"source":"usda","source_id":"172676","name":"Changed name","nutrient_basis":"per_100g","energy_kcal":1}'::jsonb,
  '[{"label":"1 loaf","grams":500}]'::jsonb);

select is((select owner_id from public.foods where id = (select id from _ids where n = 1)), null, 'the food is shared (no owner)');
select is((select count(*) from public.food_servings where food_id = (select id from _ids where n = 1)), 2::bigint, 'servings are saved');
select is((select id from _ids where n = 2), (select id from _ids where n = 1), 'a repeat import returns the same food');
select is((select name || '/' || (select count(*) from public.food_servings s where s.food_id = f.id)
           from public.foods f where f.id = (select id from _ids where n = 1)),
  'Bread, oat bran/2', 'a repeat import changes nothing');
select throws_ok($$select public.import_catalog_food('{"source":"custom","source_id":"x","name":"n","nutrient_basis":"per_100g"}'::jsonb, '[]'::jsonb)$$,
  '22023', null, 'custom foods cannot be imported as catalog rows');

select * from finish();
rollback;
