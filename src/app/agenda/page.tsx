import { AgendaBoard } from "@/components/agenda/agenda-board";
import { AvailabilityManager } from "@/components/agenda/availability-manager";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Appointment, AvailabilitySlot, Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const supabase = createAdminClient();
  const from = new Date(); from.setDate(from.getDate() - 7);
  const to = new Date(); to.setDate(to.getDate() + 35);
  const [agenda, leads, availability] = await Promise.all([
    supabase.from("appointments").select("*, leads(id,name,phone,city)").gte("starts_at", from.toISOString()).lte("starts_at", to.toISOString()).order("starts_at"),
    supabase.from("leads").select("*").order("last_message_at", { ascending: false }).limit(200),
    supabase.from("availability_slots").select("*").eq("active", true).order("weekday").order("start_time"),
  ]);
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  return <>
    <div className="page-header"><div><div className="eyebrow">Operação comercial</div><h1>Agenda Nexus</h1><p>Reuniões comerciais e aulas experimentais em um só lugar.</p></div></div>
    <AgendaBoard appointments={(agenda.data || []) as Appointment[]} leads={(leads.data || []) as Lead[]} migrationMissing={Boolean(agenda.error)} />
    {!agenda.error && <AvailabilityManager initial={(availability.data || []) as AvailabilitySlot[]} />}
  </>;
}
