import { AutoRefresh } from "@/components/ui/auto-refresh";
import { ConfigRequired } from "@/components/ui/config-required";
import { MeuDia, type DiaItem, type AgendaItem } from "@/components/meu-dia/meu-dia";
import { saoPauloDayBounds } from "@/lib/day";
import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type LeadEmbed = {
  id: string;
  name: string | null;
  phone: string;
  pipeline_stages?: { name: string } | null;
};

function leadRow(task: { id: string; due_at: string; lead: LeadEmbed | null }, reason: string): DiaItem | null {
  if (!task.lead) return null;
  return {
    task_id: task.id,
    lead_id: task.lead.id,
    lead_name: task.lead.name,
    phone: task.lead.phone,
    stage: task.lead.pipeline_stages?.name || null,
    reason,
    due_at: task.due_at,
  };
}

export default async function MeuDiaPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="page-shell">
        <div className="page-header"><div><div className="eyebrow">Operação</div><h1>Meu dia</h1></div></div>
        <ConfigRequired />
      </div>
    );
  }

  const supabase = createAdminClient();
  const { start, end } = saoPauloDayBounds();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const leadSelect = "id, name, phone, pipeline_stages(name)";

  const [
    { data: overdueTasks },
    { data: todayTasks },
    { data: pendingLeadIdsRows },
    { data: staleLeads },
    { data: appointments },
  ] = await Promise.all([
    supabase
      .from("lead_tasks")
      .select(`id, due_at, lead:leads(${leadSelect})`)
      .eq("status", "pending")
      .lt("due_at", start.toISOString())
      .order("due_at"),
    supabase
      .from("lead_tasks")
      .select(`id, due_at, lead:leads(${leadSelect})`)
      .eq("status", "pending")
      .gte("due_at", start.toISOString())
      .lte("due_at", end.toISOString())
      .order("due_at"),
    supabase.from("lead_tasks").select("lead_id").eq("status", "pending"),
    supabase
      .from("leads")
      .select("id, name, phone, last_message_at, pipeline_stages(name)")
      .is("opted_out_at", null)
      .not("temperature", "in", "(perdido,cliente)")
      .lt("last_message_at", threeDaysAgo)
      .order("last_message_at")
      .limit(50),
    supabase
      .from("appointments")
      .select(`id, title, type, starts_at, status, lead:leads(id, name, phone)`)
      .gte("starts_at", start.toISOString())
      .lte("starts_at", end.toISOString())
      .in("status", ["scheduled", "confirmed"])
      .order("starts_at"),
  ]);

  const overdue = (overdueTasks || [])
    .map((task) => leadRow(task as never, "Contato atrasado"))
    .filter(Boolean) as DiaItem[];
  const today = (todayTasks || [])
    .map((task) => leadRow(task as never, "Agendado para hoje"))
    .filter(Boolean) as DiaItem[];

  const leadsWithTask = new Set((pendingLeadIdsRows || []).map((row) => row.lead_id));
  const noResponse: DiaItem[] = ((staleLeads as unknown as (LeadEmbed & { last_message_at: string })[]) || [])
    .filter((lead) => !leadsWithTask.has(lead.id))
    .map((lead) => ({
      task_id: null,
      lead_id: lead.id,
      lead_name: lead.name,
      phone: lead.phone,
      stage: lead.pipeline_stages?.name || null,
      reason: "Sem resposta há +3 dias",
      due_at: lead.last_message_at,
    }));

  const agenda: AgendaItem[] = ((appointments as unknown as {
    id: string;
    title: string;
    type: string;
    starts_at: string;
    lead: { id: string; name: string | null; phone: string } | null;
  }[]) || []).map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    starts_at: item.starts_at,
    lead_id: item.lead?.id || null,
    lead_name: item.lead?.name || null,
    phone: item.lead?.phone || null,
  }));

  return (
    <div className="page-shell">
      <AutoRefresh />
      <div className="page-header">
        <div>
          <div className="eyebrow">Operação</div>
          <h1>Meu dia</h1>
          <p>O que precisa da sua atenção hoje, sem garimpar o Kanban.</p>
        </div>
      </div>
      <MeuDia overdue={overdue} today={today} noResponse={noResponse} agenda={agenda} />
    </div>
  );
}
