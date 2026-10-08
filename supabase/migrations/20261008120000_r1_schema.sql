-- R1 schema: profiles, targets, food catalog, private prices, diary, weights.
-- Ownership model (docs/PLAN.md §4):
--   * foods/food_servings: shared catalog rows (owner_id is null) are readable by
--     every signed-in user and writable only by the service role; custom foods are
--     private to their owner.
--   * every other table is private to its user_id.
--   * rows that reference a food, serving or price must reference one the user can see.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  sex text check (sex in ('male', 'female')),
  birth_date date,
  height_cm numeric(5, 1) check (height_cm between 50 and 272),
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  unit_system text not null default 'metric' check (unit_system in ('metric', 'imperial')),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  time_zone text not null default 'UTC',
  calorie_floor_kcal integer not null default 1200 check (calorie_floor_kcal between 800 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Every new auth user gets an empty profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Targets (history; the latest effective_from on or before a date applies)
-- ---------------------------------------------------------------------------

create table public.targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  effective_from date not null,
  kcal integer not null check (kcal between 500 and 10000),
  protein_g numeric(6, 1) not null check (protein_g >= 0),
  carbs_g numeric(6, 1) not null check (carbs_g >= 0),
  fat_g numeric(6, 1) not null check (fat_g >= 0),
  source text not null check (source in ('estimated', 'manual')),
  goal_weight_kg numeric(5, 1) check (goal_weight_kg between 20 and 500),
  kg_per_week numeric(4, 2),
  created_at timestamptz not null default now(),
  unique (user_id, effective_from)
);

-- ---------------------------------------------------------------------------
-- Food catalog
-- ---------------------------------------------------------------------------

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  -- Defaults to the signed-in user; the service role (no user) writes shared rows.
  owner_id uuid default auth.uid() references auth.users (id) on delete cascade,
  source text not null check (source in ('custom', 'usda')),
  source_id text,
  name text not null check (char_length(name) between 1 and 200),
  brand text check (char_length(brand) <= 200),
  preparation text not null default 'unspecified' check (preparation in ('raw', 'cooked', 'as_sold', 'unspecified')),
  nutrient_basis text not null check (nutrient_basis in ('per_100g', 'per_100ml', 'per_serving')),
  basis_serving_id uuid,
  density_g_per_ml numeric(6, 4) check (density_g_per_ml > 0),
  -- Nutrients per basis unit. NULL means unknown, never zero.
  energy_kcal numeric(8, 2) check (energy_kcal >= 0),
  protein_g numeric(8, 2) check (protein_g >= 0),
  carbs_g numeric(8, 2) check (carbs_g >= 0),
  fat_g numeric(8, 2) check (fat_g >= 0),
  fiber_g numeric(8, 2) check (fiber_g >= 0),
  sugar_g numeric(8, 2) check (sugar_g >= 0),
  saturated_fat_g numeric(8, 2) check (saturated_fat_g >= 0),
  sodium_mg numeric(9, 2) check (sodium_mg >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foods_custom_is_owned check (
    source <> 'custom'
    or (owner_id is not null and energy_kcal is not null and protein_g is not null
        and carbs_g is not null and fat_g is not null)
  ),
  constraint foods_catalog_is_shared check (source = 'custom' or (owner_id is null and source_id is not null)),
  constraint foods_per_serving_has_basis check ((nutrient_basis = 'per_serving') = (basis_serving_id is not null))
);

create unique index foods_source_unique on public.foods (source, source_id) where source_id is not null;
create index foods_owner_idx on public.foods (owner_id);
create index foods_name_idx on public.foods using gin (to_tsvector('simple', name || ' ' || coalesce(brand, '')));

create trigger foods_updated_at before update on public.foods
  for each row execute function public.set_updated_at();

create table public.food_servings (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  grams numeric(9, 3) check (grams > 0),
  ml numeric(9, 3) check (ml > 0),
  check (grams is not null or ml is not null),
  unique (id, food_id)
);

create index food_servings_food_idx on public.food_servings (food_id);

-- The basis serving must belong to the same food. Deferred so a food and its
-- basis serving can be inserted in one transaction.
alter table public.foods
  add constraint foods_basis_serving_fk foreign key (basis_serving_id, id)
  references public.food_servings (id, food_id) deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- Private prices
-- ---------------------------------------------------------------------------

create table public.food_prices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  food_id uuid not null references public.foods (id) on delete cascade,
  package_amount numeric(10, 3) not null check (package_amount > 0),
  package_unit text not null check (package_unit in ('g', 'ml', 'serving')),
  package_serving_id uuid,
  price_minor bigint not null check (price_minor >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  effective_date date not null,
  store_note text check (char_length(store_note) <= 200),
  created_at timestamptz not null default now(),
  check ((package_unit = 'serving') = (package_serving_id is not null)),
  foreign key (package_serving_id, food_id) references public.food_servings (id, food_id) on delete cascade
);

create index food_prices_lookup_idx on public.food_prices (user_id, food_id, currency, effective_date desc);

-- ---------------------------------------------------------------------------
-- Diary
-- ---------------------------------------------------------------------------

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  -- The source food may be deleted later; the snapshot below keeps history intact.
  food_id uuid references public.foods (id) on delete set null,
  amount numeric(10, 3) not null check (amount > 0),
  unit text not null check (unit in ('g', 'ml', 'serving')),
  serving_id uuid,
  -- Snapshot at log time.
  food_name text not null,
  serving_label text,
  food_brand text,
  resolved_grams numeric(10, 3),
  resolved_ml numeric(10, 3),
  energy_kcal numeric(9, 2),
  protein_g numeric(9, 2),
  carbs_g numeric(9, 2),
  fat_g numeric(9, 2),
  fiber_g numeric(9, 2),
  sugar_g numeric(9, 2),
  saturated_fat_g numeric(9, 2),
  sodium_mg numeric(10, 2),
  cost_status text not null check (cost_status in ('priced', 'no_price', 'not_yet_effective', 'currency_mismatch', 'unconvertible')),
  cost_minor bigint check (cost_minor >= 0),
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  price_id uuid references public.food_prices (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((cost_status = 'priced') = (cost_minor is not null)),
  check ((cost_minor is null) = (currency is null)),
  foreign key (serving_id, food_id) references public.food_servings (id, food_id) on delete set null (serving_id)
);

create index food_logs_day_idx on public.food_logs (user_id, log_date);

create trigger food_logs_updated_at before update on public.food_logs
  for each row execute function public.set_updated_at();

-- Whether the user considers a day's log complete (needed later for adaptive targets;
-- days without a row are "unknown", never zero intake).
create table public.diary_days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  status text not null check (status in ('complete', 'partial')),
  updated_at timestamptz not null default now(),
  primary key (user_id, log_date)
);

create trigger diary_days_updated_at before update on public.diary_days
  for each row execute function public.set_updated_at();

create table public.body_weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5, 2) not null check (weight_kg between 20 and 500),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

-- ---------------------------------------------------------------------------
-- Visibility helpers used by policies. SECURITY DEFINER so they can look at
-- rows the caller's own policies would hide, and answer only yes/no.
-- ---------------------------------------------------------------------------

create or replace function public.can_see_food(p_food_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.foods f
    where f.id = p_food_id and (f.owner_id is null or f.owner_id = auth.uid())
  );
$$;

create or replace function public.owns_food(p_food_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.foods f where f.id = p_food_id and f.owner_id = auth.uid());
$$;

create or replace function public.owns_price(p_price_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.food_prices p where p.id = p_price_id and p.user_id = auth.uid());
$$;

revoke all on function public.can_see_food(uuid), public.owns_food(uuid), public.owns_price(uuid) from public, anon;
grant execute on function public.can_see_food(uuid), public.owns_food(uuid), public.owns_price(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: signed-in users only. The service role bypasses RLS and is the
-- only writer of shared catalog rows.
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.targets, public.foods, public.food_servings,
  public.food_prices, public.food_logs, public.diary_days, public.body_weights from anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.targets, public.foods, public.food_servings,
  public.food_prices, public.food_logs, public.diary_days, public.body_weights to authenticated;
grant all on public.profiles, public.targets, public.foods, public.food_servings,
  public.food_prices, public.food_logs, public.diary_days, public.body_weights to service_role;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.targets enable row level security;
alter table public.foods enable row level security;
alter table public.food_servings enable row level security;
alter table public.food_prices enable row level security;
alter table public.food_logs enable row level security;
alter table public.diary_days enable row level security;
alter table public.body_weights enable row level security;

-- Profiles: own row only.
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Simple per-user tables.
create policy targets_own on public.targets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy diary_days_own on public.diary_days for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy body_weights_own on public.body_weights for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Foods: read shared + own; write own custom foods only.
create policy foods_select on public.foods for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy foods_insert on public.foods for insert to authenticated
  with check (owner_id = (select auth.uid()) and source = 'custom');
create policy foods_update on public.foods for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and source = 'custom');
create policy foods_delete on public.foods for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Servings follow their food.
create policy food_servings_select on public.food_servings for select to authenticated
  using (public.can_see_food(food_id));
create policy food_servings_insert on public.food_servings for insert to authenticated
  with check (public.owns_food(food_id));
create policy food_servings_update on public.food_servings for update to authenticated
  using (public.owns_food(food_id)) with check (public.owns_food(food_id));
create policy food_servings_delete on public.food_servings for delete to authenticated
  using (public.owns_food(food_id));

-- Prices: private, and only for foods the user can see.
create policy food_prices_select on public.food_prices for select to authenticated
  using (user_id = (select auth.uid()));
create policy food_prices_insert on public.food_prices for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_see_food(food_id));
create policy food_prices_update on public.food_prices for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_see_food(food_id));
create policy food_prices_delete on public.food_prices for delete to authenticated
  using (user_id = (select auth.uid()));

-- Logs: private; referenced food must be visible, referenced price must be own, and a
-- serving-unit entry must name its serving (checked here rather than as a table
-- constraint so deleting a serving later only clears the reference).
create policy food_logs_select on public.food_logs for select to authenticated
  using (user_id = (select auth.uid()));
create policy food_logs_insert on public.food_logs for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (food_id is null or public.can_see_food(food_id))
    and (price_id is null or public.owns_price(price_id))
    and (unit <> 'serving' or serving_id is not null)
  );
create policy food_logs_update on public.food_logs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (food_id is null or public.can_see_food(food_id))
    and (price_id is null or public.owns_price(price_id))
    and (unit <> 'serving' or serving_id is not null)
  );
create policy food_logs_delete on public.food_logs for delete to authenticated
  using (user_id = (select auth.uid()));
