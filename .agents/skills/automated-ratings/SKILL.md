---
name: padeltour-automated-ratings
description: Use whenever Padeltour work touches automated player ratings, onboarding calibration, the OpenSkill adapter, account-only rosters, Official or Practice eligibility, event rating snapshots, application or replay workers, rating presentation, admin recovery, or rating tests. Read this skill before planning, implementing, reviewing, or debugging those behaviors so identity, history, and deterministic replay remain consistent.
---

# Padeltour Automated Ratings

Automated ratings cross identity, event lifecycle, standings, persistence, and UI. Preserve one shared policy across those surfaces.

## Durable product rules

- Ratings belong to stable app accounts and follow them across clubs; membership and permissions remain workspace-scoped.
- New event rosters accept only active, accepted workspace members with completed rating onboarding. Preserve legacy manual players and historical events, but never select legacy-only players for new rosters or import manual ratings into automated profiles.
- Snapshot the account ID, player name, `mu`, `sigma`, displayed level, and engine version when an event roster is fixed. Scheduling and historical views use the immutable snapshot, not the live profile.
- Keep `openskill@5.0.1` behind the project-owned `openskill-bradley-terry-full-v1` adapter using `bradleyTerryFull`.
- Rate exactly two teams of two from win, loss, or draw rank. Point or game margin, individual contribution, and manual multipliers never affect the update.
- Display levels with `clamp(0.5, 7.0, round1(0.5 + 6.5 * mu / 50))`. Store `mu` and `sigma` at full precision and round only for presentation.
- Cold start scores three structured answer groups with ranges `0..4`, `0..2`, and `0..3`. The total `0..9` maps to displayed levels `1.0..5.5` in `0.5` steps, is converted through the inverse display mapping, and starts with `sigma = 12.5`.
- The first six Official rated match appearances are provisional. Questionnaire answers may change only before the first Official rated appearance.
- Official events affect standings and automated ratings. Practice/social events affect neither. Lock the mode once match activity begins.
- Archiving changes visibility only. Completed-event exclusion or reinstatement is a separate, reasoned, admin-only operation that changes standings and ratings together.
- Completed scores are authoritative and commit before rating work. Rating failure must never undo or corrupt match data.
- Corrections, exclusions, and reinstatements replay deterministically from the earliest affected database sequence. Never subtract old deltas or invent inverse updates.

## Integrity and architecture

- Keep questionnaire scoring, display mapping, engine calculations, eligibility, provisional policy, replay ordering, and presentation selectors in pure strict-TypeScript modules.
- Exchange project-owned rating types across the OpenSkill boundary; do not leak package objects into application code.
- Keep persistence and service credentials server-only. Validate server-action, route, and database-boundary input with Zod.
- Persist the engine manifest, canonical input/output, hashes, database order, attempts, and audit context required to reproduce an update.
- Make profile and ledger application atomic, ordered, idempotent, and retryable. Duplicate calls, overlapping workers, failures, and stale locks must not apply a result twice or let later work overtake earlier work.
- Replays must rebuild from immutable onboarding baselines and canonical event facts, preserve a reproducible audit trail, and fail closed without partially replacing profiles.
- Normal members may see current level, provisional progress, historical snapshots, and neutral updating state. Only admins may see errors, audit details, impact previews, and recovery actions.
- Components render typed props and emit user intent. Hooks manage local form, confirmation, refresh, or submission state only; durable policy stays outside React.
- Integrity comes from stable identity, admin-controlled rosters, outcome-only ratings, immutable history, and audited corrections. Do not add direct rating edits or a speculative suspicion queue.

## Tests are executable documentation

- Put focused Vitest coverage beside the owning pure module or boundary. Test names and typed fixtures should explain the rule without requiring React knowledge.
- Keep `src/domain/ratings/automated-rating-journey.test.ts` readable as the cross-feature contract: all 60 onboarding combinations, roster eligibility, snapshots, exact engine vectors, provisional graduation, event modes, replay equality, and failure recovery.
- Preserve exact golden engine vectors with explicit tolerances and prove a narrow win equals a blowout win.
- Cover duplicate processing, worker contention, transaction failure, retry limits, stale locks, safe errors, correction/exclusion/reinstatement, archive invariance, authorization, and member/admin presentation when their boundaries change.
- Use unit and focused integration-style Vitest tests with typed persistence fakes. Avoid large UI snapshots and browser frameworks for domain contracts.

## Companion workflows

- Use `padeltour-domain` for event lifecycle, standings, scoring, scheduling, and consistency rules.
- Use `padeltour-supabase` for schema, migrations, RLS, generated types, and database verification.
- Use `padeltour-ui` for responsive operational screens and visual verification.
- Use `padeltour-linear` for issue scope and status, and `padeltour-git-github` for focused publication.
- Follow `AGENTS.md` for the repository Node version and verification depth. Compare every changed rule with shipped modules, migrations, and the journey contract before handoff.

## References

- OpenSkill TypeScript: https://github.com/philihp/openskill.js
- Pinned package: https://www.npmjs.com/package/openskill/v/5.0.1
- Weng and Lin rating research: https://www.jmlr.org/papers/v12/weng11a.html
- OpenSkill paper: https://joss.theoj.org/papers/10.21105/joss.05901
