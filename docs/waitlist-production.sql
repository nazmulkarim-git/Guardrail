create table if not exists waitlist_leads (
  id text primary key,
  email text not null unique,
  name text,
  company text,
  role text,
  provider text,
  use_case text,
  monthly_ai_spend text,
  monthly_token_volume text,
  urgency text,
  pain_point text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referral_code text,
  own_referral_code text,
  referrer text,
  source_section text,
  viewport text,
  user_agent text,
  ip_address text,
  signup_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists waitlist_leads_created_at_idx on waitlist_leads (created_at desc);
create index if not exists waitlist_leads_urgency_idx on waitlist_leads (urgency);
create index if not exists waitlist_leads_provider_idx on waitlist_leads (provider);
create index if not exists waitlist_leads_utm_source_idx on waitlist_leads (utm_source);
create index if not exists waitlist_leads_referral_code_idx on waitlist_leads (referral_code);
create unique index if not exists waitlist_leads_own_referral_code_idx on waitlist_leads (own_referral_code);

alter table waitlist_leads add column if not exists monthly_token_volume text;

create table if not exists contact_messages (
  id text primary key,
  name text not null,
  email text not null,
  company text,
  role text,
  message text not null,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists contact_messages_created_at_idx on contact_messages (created_at desc);
