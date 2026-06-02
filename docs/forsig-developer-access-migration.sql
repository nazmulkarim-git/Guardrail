-- Forsig private beta developer access.
-- Run this in Supabase/Postgres after docs/forsig-mvp-schema.sql.

create table if not exists developer_users (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  email text not null unique,
  name text,
  company text,
  access_code_hash text not null,
  status text not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists developer_users_workspace_idx
  on developer_users(workspace_id, created_at desc);

create index if not exists developer_users_status_idx
  on developer_users(status, created_at desc);
