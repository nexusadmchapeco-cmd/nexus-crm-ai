-- Briefing de mudanças (ago/2026) — migração consolidada.
-- Cobre: qualificação por botões (§1), agenda com bloqueios recorrentes e
-- lembretes (§3), limite de reagendamento (§4), bloqueio de contato (§5) e a
-- régua de follow-up (§6).

-- §1 Qualificação: respostas estruturadas dos botões.
alter table leads add column if not exists modalidade text
  check (modalidade in ('presencial','online'));
alter table leads add column if not exists para_quem text
  check (para_quem in ('propria','outra'));
alter table leads add column if not exists idade_aluno text;
-- Estado da sequência de qualificação (null = concluída/legado; senão o
-- passo atual: modalidade, unidade, para_quem, idade, nome, nivel).
alter table leads add column if not exists qualification_step text;

-- §4 Reagendamento: contador + etiquetas do card (Difícil agendamento,
-- Experimental + turno).
alter table leads add column if not exists reschedule_count int not null default 0;
alter table leads add column if not exists tags text[] not null default '{}';

-- §5 Bloqueio manual de contato (independente do opt-out por SAIR).
alter table leads add column if not exists blocked_at timestamptz;

-- §3 Bloqueios recorrentes da agenda (ex.: toda segunda 06h–08h até uma data).
alter table calendar_blocks add column if not exists recurring boolean not null default false;
alter table calendar_blocks add column if not exists weekday int
  check (weekday between 0 and 6);
alter table calendar_blocks add column if not exists start_time time;
alter table calendar_blocks add column if not exists end_time time;
alter table calendar_blocks add column if not exists until date;
alter table calendar_blocks alter column starts_at drop not null;
alter table calendar_blocks alter column ends_at drop not null;

-- §6 Régua de follow-up por etapa.
create table if not exists followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  stage_role text not null,
  attempt int not null default 1,
  scheduled_for timestamptz not null,
  status text not null default 'pendente'
    check (status in ('pendente','enviado','cancelado','respondido')),
  template_name text,
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists followups_due_idx on followups(status, scheduled_for);
create index if not exists followups_lead_idx on followups(lead_id, created_at desc);
alter table followups enable row level security;
