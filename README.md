# health-fitness-nutrition

An app to plan and track a body transformation: goals, nutrition and its cost, workouts, and progress.
See [`docs/PLAN.md`](docs/PLAN.md) for the product plan, data contracts and release roadmap.

## Layout

| Path | Contents |
|---|---|
| `packages/core` | Pure TypeScript domain logic shared by every platform: quantity/unit resolution, nutrient totals, estimated consumption cost, calorie/macro target estimates, input schemas |
| `supabase/migrations` | Postgres schema with row-level security (ownership model in `docs/PLAN.md` §4) |
| `supabase/tests/database` | pgTAP tests for access rules and data integrity |

The Expo app and Electron shell arrive in later PRs (see the plan).

## Development

```sh
npm install
npm run typecheck
npm run lint
npm test
```

Requires Node 20+.

### Database tests

With Docker, using the Supabase CLI:

```sh
npx supabase db start
npx supabase test db
```

Without Docker, against a local Postgres 15+ with pgTAP installed (`pg_prove` on the PATH):

```sh
npm run db:test:local
```

This applies a minimal stand-in for Supabase's `auth` schema and roles (`scripts/db/supabase-shim.sql`) before the migrations. CI runs the tests against the real Supabase stack.
