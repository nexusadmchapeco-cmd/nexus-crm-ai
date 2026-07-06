create table if not exists calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default 'Agenda fechada',
  created_at timestamptz not null default now()
);

create index if not exists calendar_blocks_period_idx
  on calendar_blocks(starts_at, ends_at);

alter table calendar_blocks enable row level security;
