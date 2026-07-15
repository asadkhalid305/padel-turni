create table public.app_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  app_user_id uuid references public.app_users(id) on delete set null,
  event_type text not null check (length(btrim(event_type)) between 2 and 80),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  app_user_id uuid references public.app_users(id) on delete set null,
  email text check (
    email is null
    or (email = lower(btrim(email)) and email <> '')
  ),
  category text not null default 'general'
    check (category in ('general', 'bug', 'onboarding', 'invite', 'event')),
  message text not null check (length(btrim(message)) between 10 and 2000),
  created_at timestamptz not null default now()
);

create index app_events_workspace_created_at_idx
on public.app_events(workspace_id, created_at desc);

create index app_events_event_type_created_at_idx
on public.app_events(event_type, created_at desc);

create index feedback_messages_created_at_idx
on public.feedback_messages(created_at desc);

alter table public.app_events enable row level security;
alter table public.feedback_messages enable row level security;

revoke all on table public.app_events from anon, authenticated;
revoke all on table public.feedback_messages from anon, authenticated;

grant all on table public.app_events to service_role;
grant all on table public.feedback_messages to service_role;

create policy "Deny direct client access"
on public.app_events
for all
to anon, authenticated
using (false)
with check (false);

create policy "Deny direct client access"
on public.feedback_messages
for all
to anon, authenticated
using (false)
with check (false);
