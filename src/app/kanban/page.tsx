import Link from "next/link";
import { ConfigRequired } from "@/components/ui/config-required";
import { Icon } from "@/components/ui/icon";
import { getLeads, getStages } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { formatRelative, initials, labelTemperature } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const configured = isSupabaseConfigured();
  const [stages, leads] = configured ? await Promise.all([getStages(), getLeads()]) : [[], []];

  return (
    <>
      <div className="page-header">
        <div><div className="eyebrow">Pipeline de vendas</div><h1>Kanban de leads</h1><p>{leads.length} leads distribuídos em {stages.length} etapas.</p></div>
        <Link href="/test-inbound" className="button button-primary"><Icon name="plus" size={15} /> Novo lead</Link>
      </div>
      {!configured ? <ConfigRequired /> : (
        <div className="kanban-wrap">
          <div className="kanban-board">
            {stages.map((stage) => {
              const stageLeads = leads.filter((lead) => lead.stage_id === stage.id);
              return (
                <section className="kanban-column" key={stage.id}>
                  <div className="kanban-head" style={{ "--stage-color": stage.color } as React.CSSProperties}>
                    <i /><strong>{stage.name}</strong><span className="kanban-count">{stageLeads.length}</span>
                  </div>
                  {stageLeads.map((lead) => (
                    <Link href={`/conversations?lead=${lead.id}`} className="lead-card" key={lead.id}>
                      <div className="lead-card-top">
                        <div className="avatar">{initials(lead.name, lead.phone)}</div>
                        <div><strong>{lead.name || lead.phone}</strong><span>{lead.city || lead.unit_interest || "Local não informado"}</span></div>
                      </div>
                      <span className={`temperature ${lead.temperature}`}>{labelTemperature(lead.temperature)}</span>
                      <div className="lead-card-detail">{lead.objective || "Aguardando identificação do objetivo"}</div>
                      <div className="lead-card-footer"><span>{lead.source || "Direto"}</span><span>{formatRelative(lead.last_message_at)}</span></div>
                    </Link>
                  ))}
                  {!stageLeads.length && <div className="kanban-empty">Nenhum lead nesta etapa</div>}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
