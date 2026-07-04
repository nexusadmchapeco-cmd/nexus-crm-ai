import { createAdminClient } from "@/lib/supabase/admin";
import type { Appointment } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const supabase=createAdminClient();
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const start = new Date(`${localDate}T00:00:00-03:00`);
  const end = new Date(`${localDate}T00:00:00-03:00`);
  end.setDate(end.getDate()+1);
  const {data,error}=await supabase.from("appointments").select("*, leads(id,name,phone,city)").gte("starts_at",start.toISOString()).lt("starts_at",end.toISOString()).order("starts_at");
  const items=(data||[]) as Appointment[], completed=items.filter(i=>i.status==="completed"), noShow=items.filter(i=>i.status==="no_show");
  return <><div className="page-header"><div><div className="eyebrow">Gestão comercial</div><h1>Relatório diário</h1><p>Agenda, presença e produtividade do closer no dia.</p></div></div>
    {error?<div className="config-required"><h2>Relatório pronto para ativação</h2><p>Execute a migration da agenda no Supabase.</p></div>:<div className="daily-report">
      <div className="agenda-kpis"><div><span>Compromissos</span><strong>{items.length}</strong></div><div><span>Realizados</span><strong>{completed.length}</strong></div><div><span>Não compareceram</span><strong>{noShow.length}</strong></div><div><span>Taxa de realização</span><strong>{items.length?Math.round(completed.length/items.length*100):0}%</strong></div></div>
      <section className="report-list"><div className="campaign-section-title"><div><span>Hoje</span><h2>Atendimentos do closer</h2></div></div>{!items.length?<p className="agenda-empty">Nenhum atendimento agendado para hoje.</p>:items.map(i=><div key={i.id} className="report-row"><time>{new Date(i.starts_at).toLocaleTimeString("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"})}</time><i className={i.type==="closer_meeting"?"meeting":"class"}/><div><strong>{i.leads?.name||i.title}</strong><small>{i.type==="closer_meeting"?"Reunião comercial":"Aula experimental"} · {i.owner_name||"Sem responsável"}</small></div><span>{i.status==="completed"?"Realizado":i.status==="no_show"?"Faltou":"Pendente"}</span></div>)}</section>
    </div>}</>;
}
