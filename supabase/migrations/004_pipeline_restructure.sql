-- Reestrutura o pipeline em duas seções (IA / Closer), adiciona etapas novas
-- e desacopla a lógica automática do nome de exibição da etapa via `role`.

alter table pipeline_stages add column if not exists role text unique;
alter table pipeline_stages add column if not exists board_group text not null default 'ia' check (board_group in ('ia','closer'));
alter table pipeline_stages add column if not exists board_visible boolean not null default true;

update pipeline_stages set role = 'new_lead', board_group = 'ia' where name = 'Novo lead';
update pipeline_stages set role = 'ai_service', board_group = 'ia' where name = 'IA em atendimento';
update pipeline_stages set role = 'qualifying', board_group = 'ia' where name = 'Qualificando';
update pipeline_stages set role = 'hot_lead', board_group = 'ia' where name = 'Lead quente';
update pipeline_stages set role = 'handoff', board_group = 'ia' where name = 'Enviar para closer';
update pipeline_stages set role = 'closer_owns', board_group = 'closer' where name = 'Closer assumiu';
update pipeline_stages set role = 'won', board_group = 'closer' where name = 'Matrícula fechada';
update pipeline_stages set role = 'lost', board_group = 'closer' where name = 'Perdido';
update pipeline_stages set role = 'followup', board_visible = false, position = 900 where name = 'Follow-up';

-- Renomeia para a nomenclatura pedida e reordena
update pipeline_stages set name = 'Novo Lead', position = 1 where role = 'new_lead';
update pipeline_stages set name = 'Contato Feito', position = 2 where role = 'ai_service';
update pipeline_stages set name = 'Informações Passadas', position = 3 where role = 'qualifying';
update pipeline_stages set name = 'Qualificado', position = 4 where role = 'hot_lead';
update pipeline_stages set name = 'Reunião Agendada', position = 6 where role = 'handoff';
update pipeline_stages set name = 'Negociação', position = 7 where role = 'closer_owns';
update pipeline_stages set name = 'Matriculado', position = 9 where role = 'won';
update pipeline_stages set position = 10 where role = 'lost';

-- Novas etapas pedidas pelo usuário
insert into pipeline_stages (name, position, color, board_group, role)
values ('Não Qualificado', 5, '#94a3b8', 'ia', 'not_qualified')
on conflict (name) do nothing;

insert into pipeline_stages (name, position, color, board_group, role)
values ('Lista Fria', 8, '#38bdf8', 'closer', null)
on conflict (name) do nothing;

-- "Proposta enviada" não faz parte do novo layout pedido; sem leads e sem
-- referência em followup_sequences, seguro remover.
delete from pipeline_stages where name = 'Proposta enviada';
