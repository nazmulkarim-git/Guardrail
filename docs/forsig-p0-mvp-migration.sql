-- Forsig P0 MVP additions.
-- Run after docs/forsig-mvp-schema.sql and docs/forsig-developer-access-migration.sql.

create table if not exists agents (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  environment text not null default 'development',
  default_reviewer_emails jsonb not null default '[]'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index if not exists agents_workspace_idx
  on agents(workspace_id, archived_at, created_at desc);

create table if not exists notification_attempts (
  id text primary key,
  workspace_id text not null,
  escalation_id text references escalations(id) on delete cascade,
  channel text not null,
  recipient text not null,
  status text not null,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notification_attempts_escalation_idx
  on notification_attempts(escalation_id, created_at desc);
