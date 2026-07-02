create extension if not exists "pgcrypto";

create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  position integer not null,
  color text not null default '#64748b',
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text not null unique,
  city text,
  unit_interest text,
  course_interest text,
  objective text,
  level text,
  availability text,
  urgency text,
  objection text,
  temperature text not null default 'frio' check (temperature in ('frio','morno','quente','pronto_para_closer','perdido','cliente')),
  stage_id uuid not null references pipeline_stages(id),
  owner_id uuid,
  source text,
  campaign text,
  ad_name text,
  summary text,
  next_action text,
  ai_enabled boolean not null default true,
  human_takeover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references leads(id) on delete cascade,
  channel text not null default 'whatsapp',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  sender_type text not null check (sender_type in ('lead','ai','human')),
  content text not null,
  whatsapp_message_id text unique,
  status text not null default 'sent',
  is_ai boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists ai_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Nina',
  global_prompt text not null,
  model text not null default 'gpt-4.1-mini',
  temperature numeric(3,2) not null default 0.4,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists followup_sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_stage_id uuid references pipeline_stages(id),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists followup_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references followup_sequences(id) on delete cascade,
  delay_minutes integer not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists leads_stage_idx on leads(stage_id);
create index if not exists leads_last_message_idx on leads(last_message_at desc);
create index if not exists messages_lead_created_idx on messages(lead_id, created_at);

alter table pipeline_stages enable row level security;
alter table leads enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table ai_settings enable row level security;
alter table lead_events enable row level security;
alter table followup_sequences enable row level security;
alter table followup_steps enable row level security;

insert into pipeline_stages (name, position, color) values
  ('Novo lead', 1, '#64748b'),
  ('IA em atendimento', 2, '#0ea5e9'),
  ('Qualificando', 3, '#8b5cf6'),
  ('Lead quente', 4, '#f59e0b'),
  ('Enviar para closer', 5, '#f97316'),
  ('Closer assumiu', 6, '#ea580c'),
  ('Proposta enviada', 7, '#2563eb'),
  ('Matrícula fechada', 8, '#16a34a'),
  ('Follow-up', 9, '#d97706'),
  ('Perdido', 10, '#94a3b8')
on conflict (name) do update set position = excluded.position, color = excluded.color;

insert into ai_settings (name, global_prompt, model, temperature)
select 'Nina', $prompt$
Você é a assistente comercial da Nexus English Center.

A Nexus é uma escola de inglês jovem, direta e focada em adultos e jovens que querem aprender inglês para viagem, trabalho, estudos ou conversação.

Seu papel é atender leads no WhatsApp, entender o objetivo da pessoa, qualificar o interesse, coletar informações importantes e encaminhar para um consultor humano quando o lead estiver pronto.

Tom: direto, simpático, leve, natural de WhatsApp, sem parecer robô e sem textão. Faça uma pergunta por vez.

Descubra: nome, cidade, presencial ou online, objetivo com inglês, nível atual, disponibilidade e urgência para começar. Unidades: Chapecó, Passo Fundo e Online.

Não invente valores, descontos ou vagas. Se o lead pedir preço, tente entender o objetivo antes. Se insistir, diga que um consultor vai passar as opções. Encaminhe quando pedir humano, quiser começar agora, passar cidade + objetivo + disponibilidade, ou parecer pronto para matrícula.

Sua resposta deve ser curta. Extraia somente informações explícitas; não presuma dados.
$prompt$, 'gpt-4.1-mini', 0.4
where not exists (select 1 from ai_settings);
