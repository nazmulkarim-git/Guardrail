-- Forsig P1 public-beta launch additions.
-- Run after P0 migrations.

alter table escalations
  add column if not exists assigned_reviewer_email text,
  add column if not exists test_mode text;

alter table api_keys
  add column if not exists held_at timestamptz;

alter table workspaces
  add column if not exists default_reviewer_emails jsonb not null default '[]'::jsonb,
  add column if not exists email_notifications_enabled boolean not null default true;

create index if not exists escalations_assigned_reviewer_idx
  on escalations(workspace_id, assigned_reviewer_email, status, created_at desc);
