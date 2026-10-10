# health-fitness-nutrition

An app to plan and track a body transformation: goals, nutrition and its cost, workouts, and progress.
See [`docs/PLAN.md`](docs/PLAN.md) for the product plan, data contracts and release roadmap.

## Layout

| Path | Contents |
|---|---|
| `packages/core` | Pure TypeScript domain logic shared by every platform: quantity/unit resolution, nutrient totals, estimated consumption cost, diary snapshots, calorie/macro target estimates, input schemas |
| `apps/mobile` | Expo app (iOS, Android, web): sign-in, onboarding, targets, custom foods and prices, food diary with estimated food cost, Today, weight history |
| `apps/desktop` | Electron shell over the web export for Windows, packaged as `.appx` for the Microsoft Store (spike) |
| `supabase/functions/usda-search` | Edge Function: USDA FoodData Central search and import into the shared catalog |
| `supabase/migrations` | Postgres schema with row-level security (ownership model in `docs/PLAN.md` §4) |
| `supabase/tests/database` | pgTAP tests for access rules and data integrity |


## Development

```sh
npm install
npm run typecheck
npm run lint
npm test
```

Requires Node 22.12+ (Electron 44 in `apps/desktop` needs it).

### Running the app

```sh
cp apps/mobile/.env.example apps/mobile/.env   # fill in the Supabase anon key
npm run web -w @hfn/mobile                     # or: npx expo start (in apps/mobile) for iOS/Android
```

Use a non-production Supabase project for development and testing.

### End-to-end tests

CI builds the web app against a throwaway local Supabase stack and runs Playwright
(`e2e/`). Locally, with Docker:

```sh
npx supabase start
# put API_URL / ANON_KEY from `npx supabase status` into EXPO_PUBLIC_* and export:
npm run export:web -w @hfn/mobile
npm run test:e2e
```

Native behaviour (auth redirects, backgrounding, camera) is covered by
[`docs/native-smoke-checklist.md`](docs/native-smoke-checklist.md).

### Windows desktop shell

`apps/desktop` wraps the web export in Electron and packages it as `.appx` for the
Microsoft Store. Why `.appx`, and how pages and auth links are served, is in
[`docs/decisions/0001-windows-desktop-packaging.md`](docs/decisions/0001-windows-desktop-packaging.md).

```sh
npm run export:web -w @hfn/mobile                   # the shell loads apps/mobile/dist
npm start -w @hfn/desktop                           # run it (any OS)
xvfb-run -a npm run test:smoke -w @hfn/desktop      # Playwright smoke tests (drop xvfb-run off Linux)
npm run dist:win -w @hfn/desktop                    # build the .appx (Windows only)
```

CI builds the package on `windows-latest`, smoke-tests it, installs a test-signed copy and
opens an `hfn://` link to check protocol activation.

### USDA food search (Edge Function)

The `usda-search` function keeps the USDA FoodData Central API key on the server:

```sh
npx supabase secrets set USDA_API_KEY=<your key> --project-ref <project ref>
npx supabase functions deploy usda-search --project-ref <project ref>
```

Food data: U.S. Department of Agriculture, FoodData Central (public domain, CC0). The app shows this
attribution on search results and on USDA foods.

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
