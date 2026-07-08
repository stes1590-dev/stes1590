create table if not exists public.contacts (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.contacts enable row level security;

create index if not exists contacts_created_at_idx
  on public.contacts (created_at desc);
