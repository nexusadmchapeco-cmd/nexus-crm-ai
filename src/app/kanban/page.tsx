import Link from "next/link";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { ConfigRequired } from "@/components/ui/config-required";
import { Icon } from "@/components/ui/icon";
import { getFollowupHistory, getLeadEventsMap, getLeads, getStages } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const configured = isSupabaseConfigured();
  const [stages, leads, followups] = configured
    ? await Promise.all([getStages(), getLeads(), getFollowupHistory()])
    : [[], [], []];
  const events = configured ? await getLeadEventsMap(leads.map((lead) => lead.id)) : {};

  return (
    <div className="kanban-shell">
      <AutoRefresh />
      <div className="page-header">
        <div><div className="eyebrow">Pipeline de vendas</div><h1>Kanban de leads</h1><p>{leads.length} leads distribuídos em {stages.length} etapas.</p></div>
        <Link href="/test-inbound" className="button button-primary"><Icon name="plus" size={15} /> Novo lead</Link>
      </div>
      {!configured ? <ConfigRequired /> : (
        <KanbanBoard initialLeads={leads} stages={stages} followups={followups} events={events} />
      )}
    </div>
  );
}
