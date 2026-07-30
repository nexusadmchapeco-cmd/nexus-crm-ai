-- FASE 4 — Vendedores e metas.
-- (Numerada 010; a numeração andou uma casa por causa do opt-out na 008.)
-- Sem login ainda: o vendedor é escolhido num seletor e enviado como owner_name.

create table if not exists sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  role text not null default 'closer' check (role in ('sdr','closer','gestor')),
  unit text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists sales_goals (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references sellers(id) on delete cascade,
  period text not null check (period in ('dia','semana','mes')),
  reference_date date not null,
  metric text not null check (metric in ('contatos','agendamentos','matriculas','receita')),
  target numeric not null,
  created_at timestamptz not null default now(),
  unique (seller_id, period, reference_date, metric)
);

alter table sellers enable row level security;
alter table sales_goals enable row level security;
