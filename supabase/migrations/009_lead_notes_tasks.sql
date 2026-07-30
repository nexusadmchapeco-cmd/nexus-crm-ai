-- FASE 1 — Observações e follow-up manual do closer.
-- (Numerada 009 porque a 008 ficou com o opt-out da FASE 0.)
--
-- lead_notes: cada contato manual registrado pelo vendedor/closer.
-- lead_tasks: o próximo contato agendado (a cadência é manual, feita à mão).

create table if not exists lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  author_name text,
  contact_type text not null default 'whatsapp'
    check (contact_type in ('whatsapp','ligacao','presencial','email','outro')),
  outcome text not null default 'sem_resposta'
    check (outcome in ('atendeu','sem_resposta','vai_pensar','agendou','fechou','perdeu')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists lead_notes_lead_idx on lead_notes(lead_id, created_at desc);
alter table lead_notes enable row level security;

create table if not exists lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  owner_name text,
  title text not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','done','canceled')),
  done_at timestamptz,
  done_note text,
  created_from_note uuid references lead_notes(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists lead_tasks_due_idx on lead_tasks(status, due_at);
alter table lead_tasks enable row level security;
