-- Segredos de integração gerenciados pelo app (ex.: chave do ElevenLabs).
-- RLS ligado sem políticas: apenas o service role (backend) lê/escreve;
-- nenhuma rota ou página expõe estes valores.
create table if not exists app_secrets (
  name text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table app_secrets enable row level security;
