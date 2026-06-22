-- Forsig MVP product schema
-- Run this in Supabase/Postgres before using the private beta API.

create table if not exists workspaces (
  id text primary key,
  name text not null,
  owner_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_keys (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  hashed_key text not null unique,
  prefix text,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  held_at timestamptz,
  revoked_at timestamptz
);

create table if not exists escalations (
  id text primary key,
  workspace_id text not null,
  api_key_id text,
  external_agent_id text not null,
  agent_name text,
  run_id text,
  workflow_name text,
  workflow_step text,
  status text not null default 'pending',
  risk_type text not null,
  risk_level text,
  risk_reason text,
  task_title text not null,
  task_description text,
  proposed_action text not null,
  customer_impact boolean not null default false,
  context_json jsonb,
  trace_json jsonb,
  model_json jsonb,
  allowed_actions_json jsonb,
  notify_channels_json jsonb,
  callback_url text,
  timeout_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists escalations_workspace_status_idx
  on escalations(workspace_id, status, created_at desc);

create index if not exists escalations_agent_idx
  on escalations(workspace_id, external_agent_id, created_at desc);

create table if not exists decisions (
  id text primary key,
  escalation_id text not null references escalations(id) on delete cascade,
  workspace_id text not null,
  reviewer_user_id text,
  reviewer_name text,
  reviewer_channel text,
  status text not null,
  instruction text not null,
  added_context_json jsonb,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists decisions_escalation_idx
  on decisions(escalation_id, created_at desc);

create table if not exists audit_events (
  id text primary key,
  workspace_id text not null,
  escalation_id text references escalations(id) on delete cascade,
  actor_type text not null,
  actor_id text,
  event_type text not null,
  metadata_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_escalation_idx
  on audit_events(escalation_id, created_at desc);

-- Optional bootstrap for env-key mode.
-- If you set FORSIG_API_KEY and FORSIG_DEFAULT_WORKSPACE_ID=workspace_beta,
-- create this workspace so escalations have a stable owner.
insert into workspaces (id, name, owner_email)
values ('workspace_beta', 'Forsig Private Beta', null)
on conflict (id) do nothing;
