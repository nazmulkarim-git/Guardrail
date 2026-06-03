-- Forsig P1 public-beta launch additions.
-- Run after P0 migrations.

alter table escalations
  add column if not exists assigned_reviewer_email text,
  add column if not exists test_mode text;

create index if not exists escalations_assigned_reviewer_idx
  on escalations(workspace_id, assigned_reviewer_email, status, created_at desc);
