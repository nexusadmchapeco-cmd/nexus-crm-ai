create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  type text not null check (type in ('experimental_class','closer_meeting')),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','completed','no_show','cancelled')),
  owner_name text,
  meeting_url text,
  notes text,
  created_by text not null default 'human' check (created_by in ('human','ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists availability_slots (
  id uuid primary key default gen_random_uuid(),
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  type text not null check (type in ('experimental_class','closer_meeting')),
  unit text,
  owner_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  content text not null,
  unit text,
  visibility text not null default 'customer' check (visibility in ('customer','internal')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  valid_from date,
  valid_until date,
  priority integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id) on delete cascade,
  title text not null,
  body text not null,
  kind text not null default 'appointment',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists appointments_starts_idx on appointments(starts_at);
create index if not exists appointments_lead_idx on appointments(lead_id);
create index if not exists knowledge_status_idx on knowledge_articles(status, category);

alter table appointments enable row level security;
alter table availability_slots enable row level security;
alter table knowledge_articles enable row level security;
alter table notifications enable row level security;
