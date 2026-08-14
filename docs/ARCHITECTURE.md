# Architecture

## Modules

- `src/domain/`: pure scheduling, diagnostics, rankings, timer math, and consistency checks.
- `src/lib/data.ts`: server-only read model and historical aggregation.
- `src/app/actions.ts`: validated server-side mutations.
- `src/app/` and `src/components/`: App Router screens and responsive controls.
- `supabase/migrations/`: authoritative database schema.

## Database

Reusable `players` are snapshotted into `event_players`. A player may link to one signed-in `app_users` row through `players.app_user_id`; that link is the source of truth for account role display, while `account_email` remains a pending-invite/display helper. Events own rounds, and rounds own matches. Matches reference four event-player IDs, enforce distinct participants, and store score and timer state. RLS is enabled on every public table; only server-only data access has direct table access.

## Scheduling Boundary

The scheduler accepts stable player IDs, rating snapshots, per-round court counts, a persisted seed, and an event draw strategy. It returns a deterministic schedule without importing React or Supabase. Diagnostics and tests operate on the same output.

One shared pipeline validates the roster, balances appearances, limits rest streaks, and tracks partner and opponent history. Strategy policy is applied only after those shared priorities: `random` uses seeded tie-breaking without reading ratings, while `rating_balanced` additionally minimizes the difference between the two team rating totals. The same inputs and seed reproduce the same draw; changing ratings cannot change a Random variety draw.

New events default to Random variety. The migration backfills existing events as Rating balanced so previously generated draws keep their historical meaning, and duplicated events inherit their source strategy.

Schedule replacement is a pre-start operation. The server compares the persisted strategy and seed, rechecks that the event and every match are still scheduled, creates a fresh seed only when a replacement is actually needed, and calls one transactional database function to replace snapshots, rounds, and matches. A strategy change and the explicit Random variety reshuffle both require destructive confirmation because generated matchups and manual draw edits are replaced. Any live, paused, completed, or cancelled match locks regeneration, and a failed transaction leaves the previous draw intact.

## Server And Client

Reads happen in server components through the data layer. Private roster, event, and history reads require either an admin role or a linked roster player, so first-time member accounts do not see group data until an admin links them. Mutations use Zod-validated server actions and require an authenticated admin role; role-management actions require `super_admin` and preserve at least one remaining super admin. Client components are limited to form feedback, draw controls, and the ticking timer display. Secrets never enter client bundles.

## Timers And Standings

Timer state persists timestamps and accumulated pause seconds; countdown and overtime are derived with pure functions. Standings are rebuilt from completed match records, using total points when match counts are equal and average points when they differ.

## Automated Ratings

Ratings belong to signed-in accounts and are portable across clubs. New accounts
establish a provisional baseline with a three-part questionnaire. New event
rosters accept only active, accepted members whose onboarding is complete; the
roster snapshots account identity, name, rating, uncertainty, displayed level,
and engine version.

Only completed Official outcomes are rated. The project-owned OpenSkill adapter
rates a two-player team against another two-player team from win, loss, or draw;
point margin and manual multipliers are intentionally excluded. The worker
persists ordered, idempotent ledger entries and changes a profile atomically.
Corrections, exclusions, and reinstatements replay from immutable baselines and
canonical event facts rather than subtracting an old delta. See
[Automated ratings](AUTOMATED_RATINGS.md) for product policy and operations.

## Future Authorization

Replace the current server-secret table access with authenticated Supabase clients and ownership or membership policies when browser roles need direct database access. The existing RLS boundary, server actions, and repository layer keep that change localized.
