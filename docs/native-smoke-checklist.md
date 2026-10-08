# Native smoke checklist

Browser tests (Playwright) cannot exercise native behaviour. Run this on a physical
iPhone and Android device with a development build before each release, and after
any change to auth, storage or navigation.

Build: `npx eas-cli@latest build --profile development` (or `npx expo run:ios|android`), with
`apps/mobile/.env` pointing at a **non-production** Supabase project.

| # | Check | Expected |
|---|---|---|
| 1 | Create an account | Onboarding opens (or a "check your email" notice if confirmations are on) |
| 2 | Complete onboarding | Today shows the logged weight and "No targets yet" |
| 3 | Kill the app and reopen | Still signed in; Today loads without a sign-in prompt |
| 4 | Background the app for > 1 hour, reopen | Session refreshes; data loads |
| 5 | Airplane mode, try to save targets | "Not saved: you appear to be offline…"; form values are kept |
| 6 | Airplane mode, reopen app | Previously loaded Today data shows from cache |
| 7 | Sign out, sign in as a different user | No data from the first user appears at any point |
| 8 | Imperial units in Settings | Weight shows in lb; saving 176 lb stores ≈ 79.8 kg |

Added in later releases: camera permission prompt and barcode scan (R4), rest timer after
backgrounding (R3).
