import Link from "next/link";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { ConfigRequired } from "@/components/ui/config-required";
import { Icon } from "@/components/ui/icon";
import { getFollowupHistory, getLeadEventsMap, getLeads, getStages } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const configured = isSupabaseConfigured();
  const sessionUser = configured ? await getSessionUser() : null;
  const [stages, leads, followups] = configured
    ? await Promise.all([getStages(), getLeads(), getFollowupHistory()])
    : [[], [], []];
  const events = configured ? await getLeadEventsMap(leads.map((lead) => lead.id)) : {};

  // Closer vê SÓ o funil dele: as etapas manuais da parte de baixo. A parte
  // da IA (SDR) é operação do gestor — some inteira para o vendedor. Exceção:
  // os "leads bucha" (não qualificados da unidade dele) entram numa aba à
  // parte, para trabalhar quando o movimento está fraco.
  const isVendedor = sessionUser?.role === "vendedor";
  const buchaStageId = stages.find((stage) => stage.role === "not_qualified")?.id || null;
  const visibleStages = isVendedor ? stages.filter((stage) => stage.board_group === "closer") : stages;
  const stageIds = new Set(visibleStages.map((stage) => stage.id));
  if (isVendedor && buchaStageId) stageIds.add(buchaStageId);
  const visibleLeads = isVendedor ? leads.filter((lead) => stageIds.has(lead.stage_id)) : leads;

  return (
    <div className="kanban-shell">
      <AutoRefresh />
      <div className="page-header">
        <div><div className="eyebrow">Pipeline de vendas</div><h1>{isVendedor ? "Seu funil" : "Kanban de leads"}</h1><p>{visibleLeads.length} leads em {visibleStages.length} etapas.</p></div>
        {!isVendedor && (
          <Link href="/test-inbound" className="button button-primary"><Icon name="plus" size={15} /> Novo lead</Link>
        )}
      </div>
      {!configured ? <ConfigRequired /> : (
        <KanbanBoard
          initialLeads={visibleLeads}
          stages={visibleStages}
          followups={followups}
          events={events}
          authorName={sessionUser?.name || null}
          // "Leads bucha": não qualificados da unidade, no pipeline do CLOSER
          // — material de trabalho pros dias fracos (pedido do diretor).
          buchaStageId={isVendedor ? buchaStageId : null}
        />
      )}
    </div>
  );
}
