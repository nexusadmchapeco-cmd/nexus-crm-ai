-- Estrutura preparatória para o teste de nível automático (aplicação real
-- fica para uma etapa futura). Guarda o resultado por lead para exibição
-- no menu dedicado "Testes de nível".

create table if not exists level_tests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','abandoned')),
  cefr_level text check (cefr_level in ('A1','A2','B1','B2','C1','C2')),
  score integer,
  answers jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists level_tests_lead_idx on level_tests(lead_id);

alter table level_tests enable row level security;
