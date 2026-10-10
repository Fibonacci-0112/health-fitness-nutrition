# AGENTS.md

Guidance for AI coding agents working in this repository. Read [`docs/PLAN.md`](docs/PLAN.md) before any non-trivial change. It is the source of truth for scope, data contracts and the release roadmap. `ROADMAP.md` is currently a copy of it.

## Project

An app to plan and track a body transformation: targets, a food diary with estimated food cost, and weight. It is multi-user from day one: every user's data is private and protected by Postgres row-level security (RLS).

| Path | Contents |
|---|---|
| `packages/core` (`@hfn/core`) | Pure TypeScript domain logic: quantity/unit resolution, nutrient totals, estimated cost, diary snapshots, target estimates, zod schemas. No React, Supabase or platform code. |
| `apps/mobile` (`@hfn/mobile`) | Expo + Expo Router app for iOS, Android and web. See [`apps/mobile/AGENTS.md`](apps/mobile/AGENTS.md) for Expo-specific rules. |
| `supabase/migrations` | Postgres schema, RLS policies and RPC functions |
| `supabase/tests/database` | pgTAP tests |
| `supabase/functions/usda-search` | Deno Edge Function: USDA FoodData Central search and import into the shared catalog |
| `e2e/` | Playwright tests against the web export and a local Supabase stack |
| `scripts/` | `db-test-local.sh` runs the pgTAP tests without Docker |

This is an npm workspaces monorepo. Node 20+ is required, and CI uses Node 22.

## Commands

Run these from the repo root. CI runs all of them, so run the relevant ones before declaring a task done.

```sh
npm install
npm run typecheck   # tsc for packages/core and apps/mobile
npm run lint        # eslint .
npm test            # vitest: packages/*/test, apps/*/src/**/*.test.ts, supabase/functions/**/*.test.ts
deno check supabase/functions/usda-search/index.ts   # Edge Function type check (needs Deno 2)
```

Database tests (pgTAP):

```sh
npx supabase db start && npx supabase test db   # with Docker
npm run db:test:local                           # without Docker: local Postgres 15+ with pgTAP and pg_prove
```

End-to-end tests (Docker required). See `README.md` and `.github/workflows/ci.yml` for the full setup:

```sh
npx supabase start
# Export EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY from `npx supabase status`
npm run export:web -w @hfn/mobile
npm run test:e2e
```

Run the app with `npm run web -w @hfn/mobile`, or `npx expo start` in `apps/mobile`. Copy `apps/mobile/.env.example` to `apps/mobile/.env` first.

## Data contracts (do not break)

These rules are summarized from `docs/PLAN.md`. Follow them in core logic, SQL and UI.

- **Unknown is not zero.** Nutrient columns are nullable, and `null` means unknown. Never coerce `null` to `0`. Totals carry an `incomplete` flag and display as a lower bound (for example "≥ 1,850 kcal (1 item missing data)").
- **Days without a `diary_days` row are unknown**, never zero intake. Only days marked `complete` count toward future adaptive targets.
- **Money** is stored as integer minor units plus an ISO 4217 currency code. Never use floats. R1 does no currency conversion: a price in another currency leaves the entry unpriced.
- **Cost** means *estimated consumption cost*. Label it "Estimated food cost" or "est.", never "spend". Totals report how many items are unpriced and are never silently partial.
- **Units:** `g` and `ml` are canonical, and household measures are `food_servings` rows. Mass↔volume conversion is allowed only when `density_g_per_ml` is set. Reject a conversion that isn't possible with a clear error. Never guess.
- **Snapshots:** `food_logs` stores resolved quantity, nutrients and cost at log time. Editing a food or price must not rewrite history.
- **Dates:** `log_date` is the user's local calendar date (`date`), and the profile stores an IANA timezone.
- **Targets:** Mifflin-St Jeor × activity factor, with guardrails: weight-loss rate capped at 1% of body weight per week, a calorie floor (default 1,200 kcal) and protein at 1.6 g/kg by default. Warn about aggressive goals instead of silently producing extreme numbers. Manual targets always win.
- **Offline (R1):** writes require connectivity. A failed save keeps the form state and shows an error. Inserts use client-generated UUIDs with upsert-on-id. The TanStack Query cache is keyed and persisted per user and wiped on sign-out.

## Security and database rules

- `foods` / `food_servings` with `owner_id is null` form the **shared catalog**. Only the service role writes these rows, inside the `usda-search` Edge Function. Users write only their own rows.
- `food_prices`, `food_logs`, `profiles`, `targets`, `body_weights` and `diary_days` are private to their owner. Every new table needs RLS enabled, owner policies, and pgTAP tests for cross-user SELECT/INSERT/UPDATE/DELETE (follow `supabase/tests/database/rls.test.sql`).
- Visibility and ownership checks for related records go through the `security definer` helpers in the `private` schema (`private.can_see_food`, `private.owns_food`, `private.owns_price`), which are not exposed over the REST API. Any view must use `security_invoker = true`. Functions set `search_path = ''`.
- Prefer `security invoker` RPCs (for example `save_custom_food`) for multi-row writes so RLS still applies.
- Schema changes go in a **new** timestamped migration (`supabase/migrations/YYYYMMDDHHMMSS_name.sql`). Never edit an applied migration. After a schema change, regenerate `apps/mobile/src/lib/database.types.ts` with Supabase type generation and keep its header comment.
- Never commit secrets. The service role key and `USDA_API_KEY` exist only as Edge Function secrets. The client uses only the public anon key through `EXPO_PUBLIC_*` vars in a git-ignored `.env`. Use a non-production Supabase project for development and tests.
- Show the USDA attribution ("Data: USDA FoodData Central") wherever USDA foods appear.

## Code conventions

- Put domain rules and math in `packages/core`, with Vitest table tests in `packages/core/test`. The app and the Edge Function should call into core rather than duplicate logic.
- In `apps/mobile`: routes go in `src/app/` (Expo Router), Supabase queries and TanStack Query hooks go in `src/api/`, app-side pure helpers go in `src/lib/`, and shared UI goes in `src/ui/`.
- Edge Function logic sits in a testable `handler.ts` with injected dependencies, and `index.ts` only wires up Deno and Supabase. Tests use the fixtures in `supabase/functions/_shared/fixtures`.
- TypeScript is strict (`noUncheckedIndexedAccess` is on in core). Avoid `any`.
- Keep PRs small and scoped to one roadmap item, each with its own acceptance criteria (see the plan). Don't build features that are listed as out of scope for the current release.
