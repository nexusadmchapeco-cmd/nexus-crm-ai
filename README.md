# Nexus CRM AI

MVP interno de CRM WhatsApp-first com IA SDR para a Nexus English Center.

## Configuração

1. Crie um projeto no Supabase e execute `supabase/migrations/001_initial_schema.sql`.
2. Copie `.env.example` para `.env.local` e preencha Supabase e OpenAI.
3. Rode `npm install` e `npm run dev`.
4. Abra `http://localhost:3000/test-inbound` para testar o fluxo.

As telas e APIs usam dados reais do Supabase. Sem credenciais, o app mostra um estado de configuração e não cria dados locais falsos.

## Fluxo

`POST /api/messages/inbound` cria/atualiza lead e conversa, salva a mensagem, chama a IA, atualiza a qualificação e salva a resposta. Takeover humano desativa respostas automáticas até a conversa ser devolvida para a IA.
