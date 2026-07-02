import Link from "next/link";
import { ConfigRequired } from "@/components/ui/config-required";
import { Icon } from "@/components/ui/icon";
import { getLeads } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { formatRelative, initials, labelTemperature } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const configured = isSupabaseConfigured();
  const leads = configured ? await getLeads() : [];
  const today = new Date().toDateString();
  const count = (stage: string) => leads.filter((lead) => lead.pipeline_stages?.name === stage).length;
  const metrics = [
    { label: "Novos hoje", value: leads.filter((l) => new Date(l.created_at).toDateString() === today).length, color: "#64748b", note: "Entradas nas últimas 24h" },
    { label: "IA atendendo", value: count("IA em atendimento") + count("Qualificando"), color: "#0ea5e9", note: "Conversas automáticas" },
    { label: "Leads quentes", value: count("Lead quente"), color: "#f59e0b", note: "Alta intenção" },
    { label: "Para o closer", value: count("Enviar para closer"), color: "#f97316", note: "Aguardando consultor" },
    { label: "Matrículas", value: count("Matrícula fechada"), color: "#16a34a", note: "Conversões registradas" },
    { label: "Em follow-up", value: count("Follow-up"), color: "#d97706", note: "Precisam de retorno" },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Operação comercial</div>
          <h1>Bom dia, equipe Nexus</h1>
          <p>Acompanhe o que está acontecendo com seus leads agora.</p>
        </div>
        <Link href="/test-inbound" className="button button-primary"><Icon name="plus" size={15} /> Simular novo lead</Link>
      </div>
      {!configured ? <ConfigRequired /> : (
        <>
          <section className="metric-grid" aria-label="Indicadores">
            {metrics.map((metric) => (
              <article className="metric-card" key={metric.label} style={{ "--metric": metric.color } as React.CSSProperties}>
                <span className="metric-label">{metric.label}</span>
                <strong className="metric-value">{metric.value}</strong>
                <span className="metric-note"><Icon name="trend" size={10} />{metric.note}</span>
              </article>
            ))}
          </section>
          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-head"><h2>Leads mais recentes</h2><Link href="/kanban">Ver pipeline <Icon name="arrow" size={12} /></Link></div>
              {leads.slice(0, 6).map((lead) => (
                <Link className="lead-row" href={`/conversations?lead=${lead.id}`} key={lead.id}>
                  <div className="lead-cell"><div className="avatar">{initials(lead.name, lead.phone)}</div><div><strong>{lead.name || lead.phone}</strong><span>{lead.phone}</span></div></div>
                  <div className="lead-cell"><div><strong>{lead.objective || "Objetivo não informado"}</strong><span>{lead.city || lead.unit_interest || "Local não informado"}</span></div></div>
                  <span className={`temperature ${lead.temperature}`}>{labelTemperature(lead.temperature)}</span>
                  <span className="stage-badge" style={{ "--badge-color": lead.pipeline_stages?.color } as React.CSSProperties}>{lead.pipeline_stages?.name}</span>
                </Link>
              ))}
              {!leads.length && <div className="empty-inline">Nenhum lead ainda. Use o simulador para iniciar a primeira conversa.</div>}
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Movimentação recente</h2><Link href="/conversations">Conversas <Icon name="arrow" size={12} /></Link></div>
              <div className="activity-list">
                {leads.slice(0, 5).map((lead) => (
                  <div className="activity-item" key={lead.id}>
                    <div className="activity-dot" style={{ background: lead.pipeline_stages?.color }} />
                    <div><strong>{lead.name || lead.phone} está em {lead.pipeline_stages?.name}</strong><span>{lead.next_action || "Aguardando próxima interação"} · {formatRelative(lead.last_message_at)}</span></div>
                  </div>
                ))}
                {!leads.length && <div className="empty-inline">A atividade aparecerá aqui.</div>}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
