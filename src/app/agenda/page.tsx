import { AgendaBoard } from "@/components/agenda/agenda-board";
import { AvailabilityManager } from "@/components/agenda/availability-manager";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { scopedUnit, unitOrExpression, unitVisibleTo } from "@/lib/units";
import type { Appointment, AvailabilitySlot, CalendarBlock, Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const supabase = createAdminClient();
  const unit = scopedUnit(await getSessionUser());
  const from = new Date(); from.setDate(from.getDate() - 7);
  const to = new Date(); to.setDate(to.getDate() + 35);
  let leadsQuery = supabase.from("leads").select("*").order("last_message_at", { ascending: false }).limit(200);
  if (unit) leadsQuery = leadsQuery.or(unitOrExpression(unit));
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const [agenda, leads, availability, blocks, allBlocks, metricsWeek, metricsMonth] = await Promise.all([
    supabase.from("appointments").select("*, leads(id,name,phone,city,unit_interest)").gte("starts_at", from.toISOString()).lte("starts_at", to.toISOString()).order("starts_at"),
    leadsQuery,
    supabase.from("availability_slots").select("*").eq("active", true).order("weekday").order("start_time"),
    supabase.from("calendar_blocks").select("*").eq("recurring", false).gte("ends_at", from.toISOString()).lte("starts_at", to.toISOString()).order("starts_at"),
    supabase.from("calendar_blocks").select("*").or(`recurring.eq.true,ends_at.gte.${new Date().toISOString()}`).order("created_at"),
    supabase.from("appointments").select("status").gte("starts_at", weekAgo.toISOString()),
    supabase.from("appointments").select("status").gte("starts_at", monthStart.toISOString()),
  ]);
  const countBy = (rows: { status: string }[] | null) => ({
    agendadas: (rows || []).filter((r) => ["scheduled", "confirmed", "completed"].includes(r.status)).length,
    canceladas: (rows || []).filter((r) => ["cancelled", "no_show"].includes(r.status)).length,
  });
  const semana = countBy(metricsWeek.data as { status: string }[] | null);
  const mes = countBy(metricsMonth.data as { status: string }[] | null);
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  return <>
    <div className="page-header"><div><div className="eyebrow">Operação comercial</div><h1>Agenda Nexus</h1><p>Reuniões comerciais e aulas experimentais em um só lugar.</p></div></div>
    <div className="agenda-metrics">
      <div className="pv-stat b-green"><h5>Agendadas · últimos 7 dias</h5><div className="v">{semana.agendadas}</div><span>No mês: {mes.agendadas}</span></div>
      <div className="pv-stat b-red"><h5>Canceladas/no-show · 7 dias</h5><div className="v">{semana.canceladas}</div><span>No mês: {mes.canceladas}</span></div>
    </div>
    <AgendaBoard
      appointments={((agenda.data || []) as (Appointment & { leads?: { unit_interest?: string | null } | null })[])
        .filter((item) => unitVisibleTo(item.leads?.unit_interest, unit))}
      blocks={(blocks.data || []) as CalendarBlock[]}
      leads={(leads.data || []) as Lead[]}
      migrationMissing={Boolean(agenda.error)}
      blocksMigrationMissing={Boolean(blocks.error)}
    />
    {!agenda.error && (
      <AvailabilityManager
        initial={(availability.data || []) as AvailabilitySlot[]}
        blocks={(allBlocks.data || []) as never}
      />
    )}
  </>;
}
