-- Row-level security and ownership tests (docs/PLAN.md §4).
-- User A tries to read and modify user B's data, write to the shared catalog,
-- and reference B's private records. Everything here is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(63);

-- Runs a statement and returns the number of rows it affected (RLS filters
-- UPDATE/DELETE silently, so "0 rows" is the expected denial).
create function public._test_rowcount(q text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public._test_rowcount(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixtures (as the table owner, which bypasses RLS)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- Shared USDA food with a serving.
insert into public.foods (id, source, source_id, name, nutrient_basis, energy_kcal, protein_g, carbs_g, fat_g)
values ('11111111-0000-0000-0000-000000000001', 'usda', '173944', 'Oats, rolled', 'per_100g', 379, 13.2, 67.7, 6.5);
insert into public.food_servings (id, food_id, label, grams)
values ('11111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', '1 cup', 81);

-- A's custom per-serving food (basis serving inserted after the food: deferred FK).
insert into public.foods (id, owner_id, source, name, nutrient_basis, basis_serving_id, energy_kcal, protein_g, carbs_g, fat_g)
values ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'custom', 'A protein bar',
        'per_serving', 'aaaaaaaa-0000-0000-0000-000000000002', 210, 20, 22, 7);
insert into public.food_servings (id, food_id, label, grams)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '1 bar', 60),
       ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'half bar', 30);

-- B's private food, serving, price, log, weight, target and diary day.
insert into public.foods (id, owner_id, source, name, nutrient_basis, energy_kcal, protein_g, carbs_g, fat_g)
values ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'custom', 'B secret stew',
        'per_100g', 120, 8, 10, 5);
insert into public.food_servings (id, food_id, label, grams)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', '1 bowl', 350);
insert into public.food_prices (id, user_id, food_id, package_amount, package_unit, price_minor, currency, effective_date)
values ('bbbbbbbb-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b',
        'bbbbbbbb-0000-0000-0000-000000000001', 1000, 'g', 800, 'EUR', '2026-01-01');
insert into public.food_logs (id, user_id, log_date, meal_slot, food_id, amount, unit, food_name, cost_status)
values ('bbbbbbbb-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b', '2026-10-08', 'lunch',
        'bbbbbbbb-0000-0000-0000-000000000001', 350, 'g', 'B secret stew', 'no_price');
insert into public.body_weights (id, user_id, measured_on, weight_kg)
values ('bbbbbbbb-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000b', '2026-10-08', 72.4);
insert into public.targets (user_id, effective_from, kcal, protein_g, carbs_g, fat_g, source)
values ('00000000-0000-0000-0000-00000000000b', '2026-10-01', 2000, 120, 220, 60, 'manual');
insert into public.diary_days (user_id, log_date, status)
values ('00000000-0000-0000-0000-00000000000b', '2026-10-08', 'complete');

set constraints all immediate;

select is((select count(*) from public.profiles), 2::bigint, 'a profile is created for every new auth user');

-- Security-definer functions are not reachable through the API.
select ok(not has_function_privilege('anon', 'public.handle_new_user()', 'execute'), 'anon cannot call the signup trigger function');
select ok(not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'), 'users cannot call the signup trigger function');
select is(to_regprocedure('public.can_see_food(uuid)'), null, 'policy helpers are not in the exposed public schema');
select ok(not has_function_privilege('anon', 'private.can_see_food(uuid)', 'execute'), 'anon cannot call policy helpers');

-- ---------------------------------------------------------------------------
-- As user A
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- Reads
select is((select count(*) from public.foods where id = '11111111-0000-0000-0000-000000000001'), 1::bigint, 'A sees the shared catalog food');
select is((select count(*) from public.foods where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1::bigint, 'A sees own custom food');
select is((select count(*) from public.foods where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 0::bigint, 'A cannot see B''s custom food');
select is((select count(*) from public.food_servings), 3::bigint, 'A sees servings of shared and own foods only');
select is((select count(*) from public.food_prices), 0::bigint, 'A cannot see B''s prices');
select is((select count(*) from public.food_logs), 0::bigint, 'A cannot see B''s logs');
select is((select count(*) from public.body_weights), 0::bigint, 'A cannot see B''s weights');
select is((select count(*) from public.targets), 0::bigint, 'A cannot see B''s targets');
select is((select count(*) from public.diary_days), 0::bigint, 'A cannot see B''s diary days');
select is((select count(*) from public.profiles), 1::bigint, 'A sees only own profile');

-- Updates and deletes on B's rows affect nothing
select is(public._test_rowcount($$update public.foods set name = 'pwned' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$), 0::bigint, 'A cannot update B''s food');
select is(public._test_rowcount($$delete from public.foods where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$), 0::bigint, 'A cannot delete B''s food');
select is(public._test_rowcount($$update public.food_servings set grams = 1 where id = 'bbbbbbbb-0000-0000-0000-000000000002'$$), 0::bigint, 'A cannot update B''s serving');
select is(public._test_rowcount($$update public.food_prices set price_minor = 1 where id = 'bbbbbbbb-0000-0000-0000-000000000003'$$), 0::bigint, 'A cannot update B''s price');
select is(public._test_rowcount($$delete from public.food_prices where id = 'bbbbbbbb-0000-0000-0000-000000000003'$$), 0::bigint, 'A cannot delete B''s price');
select is(public._test_rowcount($$update public.food_logs set amount = 1 where id = 'bbbbbbbb-0000-0000-0000-000000000004'$$), 0::bigint, 'A cannot update B''s log');
select is(public._test_rowcount($$delete from public.food_logs where id = 'bbbbbbbb-0000-0000-0000-000000000004'$$), 0::bigint, 'A cannot delete B''s log');
select is(public._test_rowcount($$update public.body_weights set weight_kg = 50 where id = 'bbbbbbbb-0000-0000-0000-000000000005'$$), 0::bigint, 'A cannot update B''s weight');
select is(public._test_rowcount($$delete from public.body_weights where id = 'bbbbbbbb-0000-0000-0000-000000000005'$$), 0::bigint, 'A cannot delete B''s weight');
select is(public._test_rowcount($$update public.diary_days set status = 'partial' where log_date = '2026-10-08'$$), 0::bigint, 'A cannot update B''s diary day');
select is(public._test_rowcount($$delete from public.diary_days where log_date = '2026-10-08'$$), 0::bigint, 'A cannot delete B''s diary day');
-- The app marks a day complete as an upsert on (user_id, log_date); B's row for the same date is untouched.
select lives_ok(
  $$insert into public.diary_days (log_date, status) values ('2026-10-08', 'complete')
    on conflict (user_id, log_date) do update set status = excluded.status$$,
  'A can mark a date complete that B also has');
select is(public._test_rowcount($$delete from public.targets$$), 0::bigint, 'A cannot delete B''s targets');
select is(public._test_rowcount($$update public.profiles set currency = 'JPY' where user_id = '00000000-0000-0000-0000-00000000000b'$$), 0::bigint, 'A cannot update B''s profile');

-- Shared catalog is read-only for users
select throws_ok(
  $$insert into public.foods (source, source_id, name, nutrient_basis, energy_kcal) values ('usda', '999', 'Fake', 'per_100g', 1)$$,
  '42501', null, 'A cannot insert into the shared catalog');
select is(public._test_rowcount($$update public.foods set name = 'pwned' where id = '11111111-0000-0000-0000-000000000001'$$), 0::bigint, 'A cannot update a shared food');
select is(public._test_rowcount($$delete from public.foods where id = '11111111-0000-0000-0000-000000000001'$$), 0::bigint, 'A cannot delete a shared food');
select throws_ok(
  $$insert into public.food_servings (food_id, label, grams) values ('11111111-0000-0000-0000-000000000001', 'huge', 1000)$$,
  '42501', null, 'A cannot add a serving to a shared food');
select is(public._test_rowcount($$update public.food_servings set grams = 1 where id = '11111111-0000-0000-0000-000000000002'$$), 0::bigint, 'A cannot update a shared serving');

-- Inserts that claim another owner
select throws_ok(
  $$insert into public.foods (owner_id, source, name, nutrient_basis, energy_kcal, protein_g, carbs_g, fat_g)
    values ('00000000-0000-0000-0000-00000000000b', 'custom', 'Planted', 'per_100g', 1, 1, 1, 1)$$,
  '42501', null, 'A cannot create a food owned by B');
select throws_ok(
  $$insert into public.body_weights (user_id, measured_on, weight_kg) values ('00000000-0000-0000-0000-00000000000b', '2026-10-09', 99)$$,
  '42501', null, 'A cannot log a weight for B');
select throws_ok(
  $$insert into public.food_servings (food_id, label, grams) values ('bbbbbbbb-0000-0000-0000-000000000001', 'x', 1)$$,
  '42501', null, 'A cannot add a serving to B''s food');

-- References to B's private records
select throws_ok(
  $$insert into public.food_prices (food_id, package_amount, package_unit, price_minor, currency, effective_date)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 1000, 'g', 100, 'EUR', '2026-01-01')$$,
  '42501', null, 'A cannot price B''s private food');
select throws_ok(
  $$insert into public.food_logs (log_date, meal_slot, food_id, amount, unit, food_name, cost_status)
    values ('2026-10-08', 'dinner', 'bbbbbbbb-0000-0000-0000-000000000001', 100, 'g', 'x', 'no_price')$$,
  '42501', null, 'A cannot log B''s private food');
select throws_ok(
  $$insert into public.food_logs (log_date, meal_slot, food_id, amount, unit, food_name, cost_status, cost_minor, currency, price_id)
    values ('2026-10-08', 'dinner', '11111111-0000-0000-0000-000000000001', 100, 'g', 'Oats', 'priced', 80, 'EUR',
            'bbbbbbbb-0000-0000-0000-000000000003')$$,
  '42501', null, 'A cannot attach B''s price to a log');
select throws_ok(
  $$insert into public.food_logs (log_date, meal_slot, food_id, amount, unit, serving_id, food_name, cost_status)
    values ('2026-10-08', 'dinner', 'aaaaaaaa-0000-0000-0000-000000000001', 1, 'serving',
            '11111111-0000-0000-0000-000000000002', 'A protein bar', 'no_price')$$,
  '23503', null, 'a log cannot use a serving from a different food');
select throws_ok(
  $$insert into public.food_logs (log_date, meal_slot, food_id, amount, unit, food_name, cost_status)
    values ('2026-10-08', 'dinner', 'aaaaaaaa-0000-0000-0000-000000000001', 1, 'serving', 'A protein bar', 'no_price')$$,
  '42501', null, 'a serving-unit log must name its serving');

-- Data integrity
select throws_ok(
  $$insert into public.foods (source, name, nutrient_basis, energy_kcal, carbs_g, fat_g)
    values ('custom', 'No protein', 'per_100g', 100, 10, 5)$$,
  '23514', null, 'custom foods must declare calories and all macros');

-- Allowed operations
select lives_ok(
  $$insert into public.food_prices (food_id, package_amount, package_unit, package_serving_id, price_minor, currency, effective_date)
    values ('11111111-0000-0000-0000-000000000001', 10, 'serving', '11111111-0000-0000-0000-000000000002', 450, 'EUR', '2026-10-01')$$,
  'A can price a shared food (by serving)');
select lives_ok(
  $$insert into public.food_logs (id, log_date, meal_slot, food_id, amount, unit, serving_id, food_name, serving_label,
                                  energy_kcal, cost_status)
    values ('aaaaaaaa-0000-0000-0000-000000000004', '2026-10-08', 'breakfast', 'aaaaaaaa-0000-0000-0000-000000000001',
            1, 'serving', 'aaaaaaaa-0000-0000-0000-000000000003', 'A protein bar', 'half bar', 105, 'no_price')$$,
  'A can log own food by serving');
select is((select user_id from public.food_logs where id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'user_id defaults to the signed-in user');
select throws_ok(
  $$update public.food_logs set user_id = '00000000-0000-0000-0000-00000000000b' where id = 'aaaaaaaa-0000-0000-0000-000000000004'$$,
  '42501', null, 'A cannot hand a log over to B');
-- The app saves log entries as upsert-on-id, so a retried save can't duplicate them.
select lives_ok(
  $$insert into public.food_logs (id, log_date, meal_slot, food_id, amount, unit, serving_id, food_name, serving_label,
                                  energy_kcal, cost_status)
    values ('aaaaaaaa-0000-0000-0000-000000000004', '2026-10-08', 'breakfast', 'aaaaaaaa-0000-0000-0000-000000000001',
            1, 'serving', 'aaaaaaaa-0000-0000-0000-000000000003', 'A protein bar', 'half bar', 105, 'no_price')
    on conflict (id) do update set amount = excluded.amount$$,
  'A can retry saving the same log entry');
select is((select count(*) from public.food_logs where id = 'aaaaaaaa-0000-0000-0000-000000000004'), 1::bigint,
  'the retried save did not duplicate the entry');
select throws_ok(
  $$insert into public.food_logs (id, log_date, meal_slot, food_id, amount, unit, food_name, cost_status)
    values ('bbbbbbbb-0000-0000-0000-000000000004', '2026-10-08', 'lunch', '11111111-0000-0000-0000-000000000001',
            100, 'g', 'Oats, rolled', 'no_price')
    on conflict (id) do update set amount = excluded.amount$$,
  '42501', null, 'A cannot overwrite B''s log by upserting its id');
select throws_ok(
  $$delete from public.food_servings where id = 'aaaaaaaa-0000-0000-0000-000000000002'$$,
  '23503', null, 'the basis serving of a per-serving food cannot be deleted');
select lives_ok(
  $$delete from public.food_servings where id = 'aaaaaaaa-0000-0000-0000-000000000003'$$,
  'deleting a serving used by a log keeps the log');
select is((select serving_label from public.food_logs where id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  'half bar', 'the log keeps its serving snapshot');
select lives_ok(
  $$delete from public.foods where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'A can delete own food that has log entries');
select is((select food_id is null and food_name = 'A protein bar' and energy_kcal = 105
           from public.food_logs where id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  true, 'the log survives with its snapshot and a cleared food reference');

-- ---------------------------------------------------------------------------
-- As an anonymous (signed-out) client
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select count(*) from public.foods$$, '42501', null, 'anon cannot read foods');
select throws_ok($$select count(*) from public.food_logs$$, '42501', null, 'anon cannot read logs');

-- ---------------------------------------------------------------------------
-- As the service role (server-side catalog import)
-- ---------------------------------------------------------------------------
reset role;
set local role service_role;
select lives_ok(
  $$insert into public.foods (source, source_id, name, nutrient_basis, energy_kcal)
    values ('usda', '170000', 'Imported food', 'per_100g', 50)$$,
  'the service role can add shared catalog foods');

-- ---------------------------------------------------------------------------
-- Back as the owner: B's data is untouched
-- ---------------------------------------------------------------------------
reset role;
select is((select count(*) from public.diary_days where user_id = '00000000-0000-0000-0000-00000000000a' and log_date = '2026-10-08'),
  1::bigint, 'A''s same-date upsert created A''s row');
select is((select count(*) from public.diary_days where user_id = '00000000-0000-0000-0000-00000000000b' and log_date = '2026-10-08'),
  1::bigint, 'B''s same-date diary row remains');
select is((select status from public.diary_days where user_id = '00000000-0000-0000-0000-00000000000b' and log_date = '2026-10-08'),
  'complete', 'B''s diary status is unchanged');
select is((select name from public.foods where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'B secret stew', 'B''s food is unchanged');
select is((select price_minor from public.food_prices where id = 'bbbbbbbb-0000-0000-0000-000000000003'), 800::bigint, 'B''s price is unchanged');

select * from finish();
rollback;
