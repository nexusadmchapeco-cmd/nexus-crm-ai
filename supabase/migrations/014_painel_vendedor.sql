-- Painel do Vendedor (spec 31/07/2026): tarefas do dia, revisão semanal,
-- metas mensais por vendedor e ajustes no funil de parcerias.

-- Tarefas do painel: as automáticas nascem das regras (follow-up 3 dias,
-- no-show, indicação...) e são identificadas por `source` — o estado de
-- concluída persiste aqui. As manuais têm source null e manual = true.
create table if not exists seller_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  title text not null,
  chip text check (chip in ('followup','indicacao','parceria')),
  source text,
  due_date date not null default (now() at time zone 'America/Sao_Paulo')::date,
  manual boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
-- Constraint única completa (índice parcial não funciona com upsert/ON
-- CONFLICT). NULLs não conflitam entre si, então tarefas manuais (source
-- null) seguem ilimitadas.
drop index if exists seller_tasks_source_idx;
alter table seller_tasks drop constraint if exists seller_tasks_user_source_key;
alter table seller_tasks add constraint seller_tasks_user_source_key unique (user_id, source);
alter table seller_tasks enable row level security;

-- Revisão semanal de sexta (roteiro fixo). checklist = {"1": true, ...};
-- blockers = "o que travou vendas" (vai pro resumo do admin).
create table if not exists weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  week_start date not null,
  checklist jsonb not null default '{}',
  blockers text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);
alter table weekly_reviews enable row level security;

-- Metas mensais por vendedor, editáveis só pelo admin. month = dia 1 do mês.
create table if not exists panel_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  month date not null,
  metric text not null,
  target numeric not null,
  updated_at timestamptz not null default now(),
  unique (user_id, month, metric)
);
alter table panel_goals enable row level security;

-- Funil de parcerias: nova etapa "negociacao" + campos da spec.
alter table prospects drop constraint if exists prospects_status_check;
alter table prospects add constraint prospects_status_check
  check (status in ('novo','contatado','respondeu','reuniao','negociacao','fechado','descartado'));
alter table prospects add column if not exists company_name text;
alter table prospects add column if not exists segment text;
alter table prospects add column if not exists city text;
alter table prospects add column if not exists next_action text;
alter table prospects add column if not exists next_action_at date;
alter table prospects add column if not exists user_id uuid references app_users(id);
