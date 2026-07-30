-- FASE 3 — Correção manual do teste de nível.
-- (Numerada 011; a numeração andou uma casa por causa do opt-out na 008.)

alter table level_tests add column if not exists reviewed_level text
  check (reviewed_level in ('A1','A2','B1','B2','C1','C2'));
alter table level_tests add column if not exists reviewer_note text;
alter table level_tests add column if not exists reviewed_at timestamptz;
alter table level_tests add column if not exists reviewed_by text;

-- Bucket privado para guardar os áudios do speaking. Nunca público; o player
-- toca via signed URL de validade curta.
insert into storage.buckets (id, name, public)
values ('level-test-audio', 'level-test-audio', false)
on conflict (id) do nothing;
