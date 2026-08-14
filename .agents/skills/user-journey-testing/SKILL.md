---
name: padeltour-user-journey-testing
description: Use whenever a new or changed Padel Turni feature needs proof of a real browser journey across UI, authenticated roles, server actions, and persisted local Supabase state that focused Vitest or SQL tests cannot prove. Do not use it for pure domain rules, presentation-only work, or ordinary CRUD unless those boundaries genuinely require an end-to-end journey.
---

# Padel Turni user-journey testing

Browser tests are a narrow safety net for product seams. They complement rather
than replace fast deterministic tests of scheduling, scoring, ratings, replay,
validation, and persistence.

## Decide first

Add or change a Playwright journey only when the behaviour crosses the browser,
an authenticated role, a server action or route, and persisted state in a way
that focused tests cannot prove. Otherwise add the smallest owning Vitest or
SQL test and visually inspect the affected screen.

Do not backfill earlier product flows unless their current Linear issue makes
that explicit.

## Default implementation

- Use `@playwright/test` with Chromium only and one worker while the suite
  shares a local Supabase database.
- Use deterministic, local-only fixture accounts and genuine Supabase sessions.
  Never automate Google OAuth, store a real Google session, or add a test-only
  production login bypass.
- Create data through server-only fixture helpers. Keep service credentials out
  of browser code, test output, and committed files.
- Assert accessible, user-visible outcomes and one relevant persisted result.
  Prefer role, label, and text locators over implementation selectors.
- Retain traces, screenshots, and video only on failure. Use exact waits on
  UI state or requests; never use arbitrary sleeps.
- Start with direct fixture code in the spec. Extract a helper only after real
  repetition demonstrates that it makes two or more journeys clearer.

## Keep out of the browser

- Do not repeat rating vectors, score permutations, uncertainty calculations,
  replay ordering, locks, or worker races through the UI. Cover them in pure
  and SQL contract tests with explicit fixed inputs and outputs.
- Do not introduce a cross-browser matrix, broad UI snapshots, real external
  email, Vercel Cron, remote Supabase data, or production credentials.
- Do not use Playwright merely because a component has a form or button.

## Run and CI

- `npm run test:e2e` runs headless local journeys; `test:e2e:headed` and
  `test:e2e:ui` make the browser observable during local work.
- A dedicated CI job owns the local Supabase lifecycle and database reset. Keep
  the regular fast test job independent of browser installation.
- Before declaring a journey complete, run its focused spec and inspect failure
  artefacts if it fails.
