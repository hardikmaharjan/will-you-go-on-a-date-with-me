create table if not exists public.plans (
  submission_id uuid primary key,
  activity text not null check (activity in ('Coffee', 'Dinner', 'Picnic')),
  date date not null,
  note text not null check (char_length(note) between 1 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plans enable row level security;
grant all on table public.plans to service_role;
