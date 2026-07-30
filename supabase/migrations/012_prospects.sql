-- FASE 5 — Prospecção de parceiros (Google Places).
-- (Numerada 012; a numeração andou uma casa por causa do opt-out na 008.)
--
-- Os termos da Places API só permitem guardar o place_id por tempo
-- indeterminado — nome/telefone/endereço são buscados na hora a cada exibição.
-- Aqui guardamos apenas o place_id + o status da prospecção.

create table if not exists prospects (
  id uuid primary key default gen_random_uuid(),
  place_id text not null unique,
  status text not null default 'novo'
    check (status in ('novo','contatado','respondeu','reuniao','fechado','descartado')),
  owner_name text,
  note text,
  contacted_at timestamptz,
  created_at timestamptz not null default now()
);
alter table prospects enable row level security;
