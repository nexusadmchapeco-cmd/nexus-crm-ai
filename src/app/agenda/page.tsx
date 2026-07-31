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
  const [agenda, leads, availability, blocks] = await Promise.all([
    supabase.from("appointments").select("*, leads(id,name,phone,city,unit_interest)").gte("starts_at", from.toISOString()).lte("starts_at", to.toISOString()).order("starts_at"),
    leadsQuery,
    supabase.from("availability_slots").select("*").eq("active", true).order("weekday").order("start_time"),
    supabase.from("calendar_blocks").select("*").gte("ends_at", from.toISOString()).lte("starts_at", to.toISOString()).order("starts_at"),
  ]);
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  return <>
    <div className="page-header"><div><div className="eyebrow">Operação comercial</div><h1>Agenda Nexus</h1><p>Reuniões comerciais e aulas experimentais em um só lugar.</p></div></div>
    <AgendaBoard
      appointments={((agenda.data || []) as (Appointment & { leads?: { unit_interest?: string | null } | null })[])
        .filter((item) => unitVisibleTo(item.leads?.unit_interest, unit))}
      blocks={(blocks.data || []) as CalendarBlock[]}
      leads={(leads.data || []) as Lead[]}
      migrationMissing={Boolean(agenda.error)}
      blocksMigrationMissing={Boolean(blocks.error)}
    />
    {!agenda.error && <AvailabilityManager initial={(availability.data || []) as AvailabilitySlot[]} />}
  </>;
}
