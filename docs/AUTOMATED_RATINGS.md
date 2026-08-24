# Automated ratings

## Product purpose

Padel Turni gives each signed-in player a portable playing level. The level is
used to help clubs understand their roster and to build balanced draws; it is
not an organiser-controlled score. A player keeps the same rating when they
join another club, while club membership and permissions stay separate.

The system is deliberately conservative. A questionnaire gives a useful
starting point, then results from real Official events replace uncertainty with
evidence. A scoreline does not make a win more valuable: winning 6–0 and 7–6
has the same rating outcome. This avoids encouraging players to run up scores.

## Player journey

1. A new signed-in account completes three questions about padel experience,
   racket-sport background, and current ability.
2. The answers produce a provisional starting level. Players cannot type or
   select a number directly.
3. An admin can include only active club members with completed onboarding in
   a new event roster.
4. When the event roster is confirmed, Padel Turni records each player's
   account, name, rating, uncertainty, displayed level, and rating-engine
   version as an immutable event snapshot.
5. Completing an **Official** event applies its completed match outcomes to
   eligible account ratings. A **Practice / social** event changes neither
   ratings nor calibration progress.
6. Players see their current level and provisional progress. Administrators
   can additionally inspect job status and use guarded recovery tools.

## Starting level and confidence

The questionnaire has three answer groups scored as `0..4`, `0..2`, and
`0..3`. The combined score (`0..9`) maps to a displayed starting level from
`1.0` to `5.5` in `0.5` steps.

Internally, a profile contains two values:

- **mu** — the estimated playing strength.
- **sigma** — uncertainty in that estimate.

The displayed level is derived from `mu`, not stored as a separate manually
editable value:

```text
level = clamp(0.5, 7.0, round to 1 decimal place(0.5 + 6.5 × mu / 50))
```

All new profiles start with `sigma = 12.5`, meaning the starting estimate is
intentionally uncertain. Each eligible Official match gives the model more
evidence, normally reducing uncertainty. Less uncertainty means later results
generally move the estimate less sharply when they match what the rating
already predicts; an unexpected result can still move it meaningfully. The UI
calls the first six Official match appearances **provisional** and shows the
progress, for example `1 of 6 calibration matches`.

Questionnaire answers can be edited before the first Official rated match. Once
a player has an Official appearance, the initial baseline is fixed so history
can be reproduced.

## What makes a level increase or decrease

The rating engine is the project-owned
`openskill-bradley-terry-full-v1` adapter around OpenSkill's
`bradleyTerryFull` model. For every completed eligible doubles match it sees
two teams of two and one of three outcomes: win, loss, or draw.

- Beating a team the model expected you to lose to normally increases your
  level more.
- Losing to a team the model expected you to beat normally decreases your
  level more.
- Expected results usually make smaller adjustments.
- A draw is also a valid outcome and is rated as such.
- Team-mate and opponent ratings, and the uncertainty of all four players,
  affect the expectation and adjustment.

The following intentionally do **not** affect the rating: game or point margin,
individual contribution within a team, manual multipliers, event name, and
organiser judgement. The model stores `mu` and `sigma` at full precision; only
the displayed level is rounded and clamped to `0.5..7.0`.

## Event rules and historical integrity

- Only completed **Official** match results are rating input. Practice events
  are excluded entirely.
- Event ratings use the snapshot recorded when the roster was fixed, not a
  player's later live rating or renamed profile.
- Match completion is authoritative. Rating processing cannot undo or corrupt
  a recorded score if a worker fails.
- Processing is atomic, ordered, idempotent, and retryable. A ledger records
  the canonical input, output, engine version, attempt, and audit context.
- Archiving changes visibility only. Excluding or reinstating a completed event
  is an explicit admin action because it changes standings and ratings.
- A correction, exclusion, or reinstatement never tries to subtract a previous
  delta. It rebuilds affected ratings from immutable onboarding baselines and
  completed event facts in deterministic database order.

## Access and operations

Ratings are account-owned, but event and club data remains workspace-scoped.
Members can view their own club's normal rating information; only owners and
admins can create events, manage rosters, inspect rating diagnostics, or run
recovery actions. Browser-facing Supabase roles have no direct access to
product tables or rating routines; server-only code performs the authorised
operations.

Official results are normally applied in the event-completion action. The Vercel
cron is a once-daily recovery worker on the Hobby plan: it processes failed,
stale, and explicitly requeued jobs when no immediate event action is running.
It requires the server-only `CRON_SECRET`; without that variable, the scheduler
is rejected and queued recovery work will not run.

## Change guide

When changing this feature, treat these as one policy: questionnaire scoring,
display mapping, Official/Practice eligibility, event snapshots, engine
version, worker ordering, replay, and member/admin visibility. Update the
focused rating contracts and database tests first. Add a browser journey only
when a real UI plus authentication plus persisted-state interaction needs proof.

The main executable cross-feature contract is
`src/domain/ratings/automated-rating-journey.test.ts`. It covers all
questionnaire combinations, roster eligibility, snapshots, engine vectors,
provisional graduation, event modes, replay equality, and failure recovery.
