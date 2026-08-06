import Link from "next/link";
import { ChatActions } from "@/components/conversations/chat-actions";
import { Composer } from "@/components/conversations/composer";
import { ConversationList } from "@/components/conversations/conversation-list";
import { MessageList } from "@/components/conversations/message-list";
import { LeadHistory } from "@/components/leads/lead-history";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { ConfigRequired } from "@/components/ui/config-required";
import { Icon } from "@/components/ui/icon";
import { getFollowupHistory, getLeads, getMessages } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { getSessionUser } from "@/lib/session";
import { formatRelative, initials, labelTemperature } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const configured = isSupabaseConfigured();
  if (!configured) return <><div className="page-header"><div><div className="eyebrow">Atendimento</div><h1>Conversas</h1></div></div><ConfigRequired /></>;
  const sessionUser = await getSessionUser();
  const isVendedor = sessionUser?.role === "vendedor";
  const leads = await getLeads();
  const params = await searchParams;
  const selected = leads.find((lead) => lead.id === params.lead) || leads[0];
  const [messages, followups] = selected
    ? await Promise.all([getMessages(selected.id), getFollowupHistory(selected.id)])
    : [[], []];

  return (
    <div className="conversations-shell">
      <AutoRefresh />
      <div className="page-header">
        <div><div className="eyebrow">Caixa de entrada</div><h1>Conversas</h1><p>Atendimento em tempo real entre IA, lead e equipe comercial.</p></div>
      </div>
      <div className="chat-layout">
        <aside className="conversation-list">
          <div className="chat-section-head"><h2>Conversas</h2></div>
          <ConversationList
            items={leads.map((lead) => ({
              id: lead.id,
              name: lead.name,
              phone: lead.phone,
              last_message_at: lead.last_message_at,
              preview: lead.next_action || lead.objective || "Nova conversa",
            }))}
            selectedId={selected?.id || null}
          />
        </aside>
        {!selected ? (
          <div className="chat-empty"><div><Icon name="chat" size={28} /><p>Nenhuma conversa ainda.</p><span>As conversas do WhatsApp aparecem aqui.</span></div></div>
        ) : (
          <>
            <section className="chat-main">
              <div className="chat-contact">
                <div className="avatar">{initials(selected.name, selected.phone)}</div>
                <div><strong>{selected.name || selected.phone}</strong><span>{selected.city || "Local não informado"} · WhatsApp</span></div>
                <span className={`mode-pill ${selected.human_takeover ? "human" : ""}`}>{selected.human_takeover ? "Humano assumiu" : "IA automática"}</span>
              </div>
              <MessageList messages={messages} />
              {isVendedor ? (
                <div className="chat-wa-cta">
                  <span>A conversa do closer acontece no WhatsApp real.</span>
                  <a className="pv-btn-green pv-btn-sm" href={`https://wa.me/${selected.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                    Abrir WhatsApp de {selected.name || selected.phone}
                  </a>
                </div>
              ) : (
                <Composer leadId={selected.id} />
              )}
            </section>
            <aside className="lead-panel">
              <div className="lead-panel-header">
                <div className="lead-panel-profile">
                  <div className="avatar">{initials(selected.name, selected.phone)}</div>
                  <h3>{selected.name || "Lead sem nome"}</h3><p>+{selected.phone}</p>
                  {selected.opted_out_at && (
                    <span className="lead-opt-out" title="Lead pediu para sair (opt-out)">
                      Opt-out
                    </span>
                  )}
                </div>
                <ChatActions
                  leadId={selected.id}
                  humanTakeover={selected.human_takeover}
                  leadLabel={selected.name || selected.phone}
                />
              </div>
              <div className="lead-panel-body">
                <div className="detail-section">
                  <h4>Histórico de follow-up</h4>
                  {followups.length ? (
                    <div className="followup-history">
                      {followups.map((item) => (
                        <div key={item.id}>
                          <span>{item.label}</span>
                          <strong>
                            {new Intl.DateTimeFormat("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(new Date(item.created_at))}
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-detail">Nenhum follow-up enviado.</div>
                  )}
                </div>
                <div className="detail-section">
                  <h4>Dados do lead</h4>
                  <div className="detail-grid">
                    <Detail label="Cidade" value={selected.city} />
                    <Detail label="Unidade" value={selected.unit_interest} />
                    <Detail label="Objetivo" value={selected.objective} />
                    <Detail label="Nível" value={selected.level} />
                    <Detail label="Disponibilidade" value={selected.availability} />
                    <Detail label="Temperatura" value={labelTemperature(selected.temperature)} />
                    <Detail label="Etapa atual" value={selected.pipeline_stages?.name} />
                    <Detail label="Origem" value={selected.source} />
                  </div>
                </div>
                <div className="detail-section"><h4>Resumo da IA</h4><div className="ai-summary">{selected.summary || "A IA criará um resumo conforme a conversa evoluir."}</div></div>
                <div className="detail-section"><h4>Próxima ação</h4><div className="next-action">{selected.next_action || "Aguardar resposta do lead."}</div></div>
                <div className="detail-section">
                  <h4>Follow-up do closer</h4>
                  <LeadHistory leadId={selected.id} />
                </div>
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return <div className="detail-item"><span>{label}</span><strong>{value || "—"}</strong></div>;
}
