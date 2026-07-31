-- Usuários do painel com papéis e unidade. Senhas com bcrypt (pgcrypto) e
-- verificação dentro do Postgres; o app nunca vê nem guarda senha em claro.
-- A chave que assina o cookie de sessão também nasce aqui (app_secrets), então
-- nenhuma variável nova é necessária no Vercel.

create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  role text not null default 'vendedor' check (role in ('admin','sdr','vendedor')),
  -- unit obrigatória só para vendedor: define o que ele enxerga.
  unit text check (unit in ('chapeco','passo_fundo')),
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app_users enable row level security;

insert into app_secrets (name, value)
values ('auth_session_secret', encode(gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

-- Login: retorna o usuário se e-mail + senha conferem.
create or replace function auth_login(p_email text, p_password text)
returns table (id uuid, email text, name text, role text, unit text)
language sql
security definer
set search_path = public
as $$
  select u.id, u.email, u.name, u.role, u.unit
  from app_users u
  where u.active
    and lower(u.email) = lower(trim(p_email))
    and u.password_hash = crypt(p_password, u.password_hash);
$$;

-- Gera hash bcrypt para criar usuário / redefinir senha.
create or replace function auth_hash_password(p_password text)
returns text
language sql
security definer
set search_path = public
as $$
  select crypt(p_password, gen_salt('bf'));
$$;
