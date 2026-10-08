# Plan (rev 2): Health, Fitness & Nutrition App

## Context
The repo (`fibonacci-0112/health-fitness-nutrition`) is empty apart from a README and `.gitignore`. The goal is an app that supports a body transformation: goals, nutrition with cost, meals, workouts, and progress tracking, inspired by MyFitnessPal, TrainingPeaks, MacroFactor, Strong/Hevy and Cronometer. You are the first user, and it should be able to become a public product later.

**Decisions so far:** Expo (iOS/Android/web) + an Electron shell for the Microsoft Store; Supabase (Postgres/Auth/RLS); multi-user from day one; food data from external sources plus custom foods with prices.

**What changed in rev 2:** keep the platform choices, tighten the data contracts (catalog vs. prices, quantities, cost semantics, ownership/RLS, offline, targets), and replace "Phases 1–2 in one session" with a **narrow first release (R1)** delivered as small PRs, each with its own acceptance criteria.

---

## R1 scope: first usable release
1. Auth (email/password) and profile setup.
2. Calorie/macro targets: an initial estimate that you can always override manually.
3. Custom foods, plus **one** external source: **USDA FoodData Central** (public domain/CC0; has generic and branded foods with GTINs, so barcodes can be added later without changing source).
4. Diary with **price-aware estimated consumption cost**.
5. Basic weight logging.
6. A simple Today screen.

**R1 acceptance journey:** sign up → set profile → accept or override targets → create a custom food with a price → find a USDA food and add a price → log both (in g, ml and servings) → Today shows correct calories, macros and **estimated food cost**, with unpriced or incomplete items flagged → log weight → sign out and sign in as a second user, who sees none of the first user's data.

**Out of R1:** recipes, saved meals, barcode, workouts, meal planning, grocery lists, actual spend, adaptive targets, charts beyond a basic weight list, photos, Open Food Facts, and Store submission. See Roadmap.

---

## Data contracts

### 1. Shared catalog vs. personal prices
- `foods` holds **nutrition only**, with no prices. `owner_id` is null for shared catalog rows (USDA imports) or set to a user for private custom foods.
- `food_prices` is **private per user**: `user_id, food_id, package_quantity, package_unit ('g'|'ml'|'serving'), serving_id?, price_minor (integer minor units), currency (ISO 4217), effective_date, store_note?`.
- The price for a log entry is the user's price for that food with the latest `effective_date <= log_date` **in the profile currency**. R1 has no currency conversion: prices in another currency are ignored and the entry is flagged as unpriced.
- `food_logs` stores **snapshots**: resolved quantity, nutrient values, `cost_minor`, `currency` and `price_id`. Later edits to foods or prices never rewrite history. A log can be re-snapshotted only through an explicit "refresh from current" action.

### 2. What "cost" means
- **R1 tracks one quantity: estimated consumption cost** = consumed quantity × the unit price from the applicable price record. The UI always labels it "Estimated food cost". It is never called "spend".
- Day totals show `€X.XX est.` plus a count of unpriced items ("2 items unpriced"). Totals are never silently partial.
- **Actual grocery spend** (later) needs `purchases`/`purchase_items` records. A grocery list must round up to purchasable package sizes and can subtract pantry stock. Both are deferred, and they are kept as separate concepts from consumption cost.

### 3. Nutrition and quantity model
- **Nutrient basis per food:** `nutrient_basis ∈ {per_100g, per_100ml, per_serving}`, plus `basis_serving_id` when the basis is per serving.
- **Units:** mass `g` and volume `ml` are canonical (stored metric; display converts to oz/lb/fl oz). Counts and household measures are **`food_servings`** rows (`label`, `grams?`, `ml?`), for example "1 slice = 28 g".
- **Conversions:** a log entry is `amount + unit` (`g`, `ml` or a `serving_id`). The resolver in `packages/core` converts it into the food's basis dimension. Mass↔volume is allowed **only if the food has `density_g_per_ml`**. Anything that can't be converted is **rejected with a clear error**, never guessed.
- **Missing vs. zero:** every nutrient column is nullable, and `null` means unknown. Calories, protein, carbs and fat are required for custom foods. Imported foods may lack some values, and those values are marked unknown. Totals carry an `incomplete` flag and show "≥ 1,850 kcal (1 item missing data)" instead of treating unknown as 0.
- **Raw/cooked:** `foods.preparation ∈ {raw, cooked, as_sold, unspecified}` is shown next to the name so you pick the right entry. Recipe yield (finished cooked weight → per-gram nutrition) comes in R2.
- **Money:** integer minor units plus an ISO currency code. Never floats.
- **Dates:** `log_date` is the user's local calendar date (a `date`, not a timestamp). The profile stores an IANA timezone.
- **Provider terms:** USDA FDC data is public domain. The app shows a "Data: USDA FoodData Central" attribution, and imported rows are cached in the shared catalog. **Before adding Open Food Facts** (ODbL database and CC-BY-SA images), a licensing review must cover attribution and share-alike obligations for a cached shared catalog. This review gates R4.

### 4. Ownership and RLS design
| Table | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `foods`, `food_servings` | `owner_id is null OR owner_id = auth.uid()` (servings via the parent food) | Only own rows (`owner_id = auth.uid()`). Shared rows (`owner_id is null`) are written **only by the service role** in the USDA import Edge Function |
| `food_prices` | own | own, and `WITH CHECK` that the referenced food is visible to the user |
| `food_logs` | own | own, and `WITH CHECK` that the food is visible and the serving belongs to that food |
| `profiles`, `targets`, `body_weights`, `diary_days` | own | own |
| (later) `exercises` | shared OR own | same pattern as `foods` |
| (later) progress photos | Supabase **Storage** policies: private bucket, path prefix `{uid}/…`, owner-only read/write, served via signed URLs |
- Visibility checks for related records live in a `security definer` helper, `can_see_food(food_id)`, used by policies and triggers.
- Views use `security_invoker = true` so they inherit RLS.
- **pgTAP tests** cover user A and B performing SELECT/INSERT/UPDATE/DELETE on each other's rows, referencing B's private food from A's log or price, writing to shared foods as a normal user (must fail), and unauthenticated access (must fail).

### 5. Offline behavior
- **R1 explicitly requires connectivity for writes.** A failed save keeps the form state and shows "Not saved: offline". Nothing is lost silently.
- **Groundwork laid in R1:** client-generated UUIDs for every insert, written as upsert-on-id, so retries can't create duplicates. The TanStack Query cache is **keyed and persisted per user id** and wiped on sign-out.
- **R3 (workout logger) adds real offline support:** persisted drafts, a durable outbox replayed on reconnect, last-write-wins per row with `updated_at`, and timestamp-based rest timers (`ends_at`, not a countdown) so they survive backgrounding.

### 6. Targets and safety rules
- **R1:** a Mifflin-St Jeor BMR × activity factor estimate. The user picks a weekly rate **or** a goal date, and the other is derived and shown.
- **Guardrails:**
  - Weight-loss rate is capped at 1% of body weight per week.
  - A calorie floor applies (default 1,200 kcal, configurable).
  - Protein defaults to 1.6 g/kg.
  - If a goal date implies an aggressive rate, the app shows the implied rate and warns. You choose between a later date, accepting the capped rate, or a manual target. It never silently generates an extreme number.
- `targets` history: `kcal, protein_g, carbs_g, fat_g, source ('estimated'|'manual'), effective_from`. Manual targets always win.
- **Adaptive TDEE (R5+) is gated on data quality:**
  - Days count only if marked complete in `diary_days`; unlogged days are missing, never zero.
  - It needs at least 21 days with at least 80% complete days and at least 8 weigh-ins.
  - It uses trend weight (EMA) and shows the estimate with an uncertainty range.
  - It makes **no recommendation** when data is insufficient, and explains why.
  - Changes are proposals that need your acceptance, with the reasoning shown.

---

## Architecture
```
apps/mobile    Expo + expo-router (iOS/Android/Web)
apps/desktop   Electron shell over the Expo web export (added at the Windows spike)
packages/core  pure TS: units/quantity resolver, nutrition totals, cost, targets, zod schemas
packages/api   Supabase client + typed queries/hooks
supabase/      migrations, RLS, pgTAP tests, functions/usda-search (service role, holds API key)
```
TypeScript, npm workspaces, TanStack Query + persister, zod, Vitest, and GitHub Actions (typecheck, lint, Vitest, `supabase db reset` + pgTAP).

## Platform validation (early, in parallel with R1)
- **Windows spike PR:** a minimal Electron shell loading the web export. Verify which package format Partner Center accepts for this app and how to produce it: electron-builder's `appx` target builds **.appx**, not MSIX, so MSIX may need a different toolchain such as the MSIX Packaging Tool or makeappx. Also verify the Supabase auth redirect in Electron (custom protocol vs. loopback). This runs on a `windows-latest` CI runner and ends in a written decision record. It can't be executed in this Linux container.
- **Native smoke checklist (from the auth PR onward):** an EAS development build on a physical iPhone/Android covering sign-in redirect, session persistence after app kill, and offline save error. Camera permission and barcode checks join when barcode lands. Playwright on web covers only browser flows.

## R1 delivered as small PRs (each with acceptance criteria)
1. **Scaffold + core math.** Monorepo, CI, `packages/core` with the quantity resolver, nutrient totals (with incomplete flag), cost (minor units, price selection by date and currency), and target estimate + guardrails. *Accept:* Vitest table tests for each rule above, including unconvertible-unit rejection, null ≠ 0, a price effective-date boundary, wrong-currency → unpriced, and an aggressive goal date → warning.
2. **Schema + RLS.** Migrations for `profiles, targets, foods, food_servings, food_prices, food_logs, diary_days, body_weights`, plus policies and pgTAP. *Accept:* every cross-user CRUD case listed in §4 fails, and the shared-catalog write by a normal user fails.
3. **App shell + auth + profile/targets.** *Accept:* sign up, sign in and sign out (cache wiped); the targets screen shows the estimate, guardrail warnings work, and a manual override persists. Native smoke checklist passes.
4. **Custom foods + servings + prices.** *Accept:* create a per-100 g food with a "1 slice" serving and a price; validation rejects a missing kcal or macro value.
5. **USDA search.** Edge Function proxy, import into the shared catalog, and attribution. *Accept:* search, import and log a USDA food; re-searching doesn't duplicate catalog rows (unique `source, source_id`).
6. **Diary + Today + weight.** *Accept:* the full R1 journey above passes as a Playwright web test against local Supabase, and totals match hand-computed fixtures.

## Roadmap after R1
- **R2:** recipes (ingredients, servings, cooked-yield weight), saved meals, recents/favorites, copy day/meal.
- **R3:** exercise library (shared seed + custom), workout templates, strength/cardio logging, PRs, timestamp-based rest timer, **offline outbox**.
- **R4:** barcode scanning (USDA GTIN first; Open Food Facts after the licensing review), weight trend chart, measurements, private progress photos.
- **R5:** meal planner, grocery list (package rounding, pantry), purchase records → **actual spend** vs. estimated cost, budget.
- **R6:** adaptive TDEE (gated as in §6), programs and training calendar (planned vs. done), training load chart, goal projections.
- **Desktop Store submission**, once the Windows spike's decision record is approved.

## Inputs needed from you
- A Supabase project (URL + anon key). The service role key goes only into Edge Function secrets.
- A USDA FoodData Central API key (free).
- A Windows runner is available by default on GitHub Actions. A Partner Center account is needed only at submission time.
