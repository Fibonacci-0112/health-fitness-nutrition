# health-fitness-nutrition

An app to plan and track a body transformation: goals, nutrition and its cost, workouts, and progress.
See [`docs/PLAN.md`](docs/PLAN.md) for the product plan, data contracts and release roadmap.

## Layout

| Path | Contents |
|---|---|
| `packages/core` | Pure TypeScript domain logic shared by every platform: quantity/unit resolution, nutrient totals, estimated consumption cost, calorie/macro target estimates, input schemas |

The Expo app, Supabase schema and Electron shell arrive in later PRs (see the plan).

## Development

```sh
npm install
npm run typecheck
npm run lint
npm test
```

Requires Node 20+.
