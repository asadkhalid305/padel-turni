# Public Launch Operations

## Environment

Set these app environment variables anywhere the Next.js app runs:

- `NEXT_PUBLIC_APP_ORIGIN`: canonical public URL used for metadata and social
  preview images, for example `https://padel-tourni.vercel.app`.
- `RESEND_API_KEY`: Resend API key used by server actions.
- `RESEND_FROM_EMAIL`: verified sender address used as the email `from`.
- `RESEND_SUPPORT_EMAIL`: inbox that receives contact form submissions.
- `PADELTOUR_SUPER_ADMIN_EMAIL`: account email promoted to `super_admin` on
  sign-in.
- `PADELTOUR_SEEDED_PERSONAL_WORKSPACES`: optional comma-separated
  `email:workspace_id` mapping used only to claim ownerless seeded local
  workspaces. Example:
  `owner@example.com:90000000-0000-4000-8000-000000000001`.

For local development, put these in `.env.local`. For production and previews,
put them in Vercel project environment variables. These values are read by the
Next.js app, not by Supabase database migrations, so they do not need to be
added as Supabase project secrets unless a future Supabase Edge Function also
uses them.

## Feedback

Public support messages are sent to `RESEND_SUPPORT_EMAIL` through Resend.
When the launch migration has been applied, they are also stored in
`public.feedback_messages`.

Review new rows before planning product work. If a message reveals a real bug,
missing feature, documentation gap, or repeated onboarding problem, create or
reuse a Linear issue and keep the issue focused on the observable outcome.

## Analytics

High-level activation events are stored in `public.app_events`.

Tracked events:

- `landing_viewed`
- `sign_in_started`
- `first_club_ready`
- `invite_created`
- `invite_accepted`
- `event_created`
- `event_completed`
- `feedback_submitted`

Do not add invite tokens, player names, match scores, or private match details
to analytics metadata. Use aggregate counts and coarse funnel events only.
