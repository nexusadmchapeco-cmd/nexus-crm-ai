-- Opt-out de marketing/follow-up (FASE 0.2).
-- Quando o lead responde SAIR/PARAR/CANCELAR/DESCADASTRAR, gravamos a data.
-- Envio iniciado pelo lead continua permitido; só campanha e follow-up são
-- bloqueados para leads com opted_out_at preenchido.
alter table leads add column if not exists opted_out_at timestamptz;
