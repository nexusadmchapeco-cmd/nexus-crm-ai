-- Teste de nível com 4 habilidades:
-- - lead_id opcional: permite gerar link avulso pela aba Testes de nível
-- - skills: resultado por habilidade (reading/listening/writing/speaking)
alter table level_tests alter column lead_id drop not null;
alter table level_tests add column if not exists skills jsonb;
