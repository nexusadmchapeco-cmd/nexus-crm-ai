"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { Appointment, AppointmentStatus, Lead } from "@/lib/types";

const labels: Record<AppointmentStatus,string> = { scheduled:"Aguardando", confirmed:"Confirmado", completed:"Realizado", no_show:"Não compareceu", cancelled:"Cancelado" };

export function AgendaBoard({ appointments: initial, leads, migrationMissing }: { appointments: Appointment[]; leads: Lead[]; migrationMissing: boolean }) {
  const [items,setItems]=useState(initial), [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [open,setOpen]=useState(false), [notice,setNotice]=useState("");
  const [form,setForm]=useState({type:"closer_meeting",lead_id:"",title:"Reunião comercial",time:"14:00",duration:"30",owner_name:"Closer Nexus",meeting_url:"",notes:""});
  const day=useMemo(()=>items.filter(i=>i.starts_at.slice(0,10)===date),[items,date]);
  async function create() {
    const starts=new Date(`${date}T${form.time}:00`), ends=new Date(starts.getTime()+Number(form.duration)*60000);
    const response=await fetch("/api/appointments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,starts_at:starts.toISOString(),ends_at:ends.toISOString()})});
    const body=await response.json(); if(!response.ok)return setNotice(body.error);
    setItems(current=>[...current,body].sort((a,b)=>a.starts_at.localeCompare(b.starts_at))); setOpen(false); setNotice("Compromisso agendado.");
  }
  async function status(id:string,next:AppointmentStatus){
    const response=await fetch(`/api/appointments/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:next})});
    const body=await response.json(); if(!response.ok)return setNotice(body.error);
    setItems(current=>current.map(i=>i.id===id?body:i));
  }
  if(migrationMissing)return <div className="config-required"><Icon name="calendar" size={28}/><h2>Agenda pronta para ativação</h2><p>Execute <code>002_agenda_knowledge.sql</code> no Supabase.</p></div>;
  return <div className="agenda-shell">
    <section className="agenda-toolbar"><div className="agenda-date"><label htmlFor="agenda-date">Dia da operação</label><input id="agenda-date" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><div className="agenda-legend"><span><i className="meeting"/> Reunião com closer</span><span><i className="class"/> Aula experimental</span></div><button className="button button-primary" onClick={()=>setOpen(true)}><Icon name="plus" size={15}/> Novo compromisso</button></section>
    <div className="agenda-kpis"><div><span>Reuniões</span><strong>{day.filter(i=>i.type==="closer_meeting").length}</strong></div><div><span>Aulas experimentais</span><strong>{day.filter(i=>i.type==="experimental_class").length}</strong></div><div><span>Realizados</span><strong>{day.filter(i=>i.status==="completed").length}</strong></div><div><span>Próximos</span><strong>{day.filter(i=>["scheduled","confirmed"].includes(i.status)).length}</strong></div></div>
    <section className="agenda-day"><div className="agenda-events">{!day.length&&<div className="agenda-empty">Nenhum compromisso neste dia.</div>}{day.map(item=><article key={item.id} className={`agenda-event ${item.type==="closer_meeting"?"meeting":"class"}`}><time>{new Date(item.starts_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</time><div><strong>{item.title}</strong><span>{item.leads?.name||"Sem lead vinculado"} · {item.owner_name||"Sem responsável"}</span><small>{labels[item.status]}{item.created_by==="ai"?" · Agendado pela IA":""}</small></div><div className="agenda-actions">{item.meeting_url&&<a href={item.meeting_url} target="_blank" rel="noreferrer">Abrir Meet</a>}{item.status!=="completed"&&<button onClick={()=>status(item.id,"completed")}>Confirmar realização</button>}{item.status!=="no_show"&&<button className="muted" onClick={()=>status(item.id,"no_show")}>Não compareceu</button>}</div></article>)}</div></section>
    {notice&&<div className="studio-notice ok">{notice}</div>}
    {open&&<div className="agenda-modal-backdrop"><form className="agenda-modal" onSubmit={e=>{e.preventDefault();create();}}><div className="agenda-modal-head"><div><span>Novo compromisso</span><h2>Agendar atendimento</h2></div><button type="button" className="icon-button" onClick={()=>setOpen(false)}><Icon name="x"/></button></div><div className="field-grid"><div className="field"><label>Tipo</label><select value={form.type} onChange={e=>setForm({...form,type:e.target.value,title:e.target.value==="closer_meeting"?"Reunião comercial":"Aula experimental"})}><option value="closer_meeting">Reunião com closer</option><option value="experimental_class">Aula experimental</option></select></div><div className="field"><label>Lead</label><select value={form.lead_id} onChange={e=>setForm({...form,lead_id:e.target.value})}><option value="">Selecionar lead</option>{leads.map(l=><option key={l.id} value={l.id}>{l.name||l.phone}</option>)}</select></div></div><div className="field"><label>Título</label><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></div><div className="field-grid"><div className="field"><label>Horário</label><input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})}/></div><div className="field"><label>Duração</label><select value={form.duration} onChange={e=>setForm({...form,duration:e.target.value})}><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60">1 hora</option></select></div></div><div className="field"><label>Responsável</label><input value={form.owner_name} onChange={e=>setForm({...form,owner_name:e.target.value})}/></div>{form.type==="closer_meeting"&&<div className="field"><label>Link do Google Meet</label><input placeholder="https://meet.google.com/..." value={form.meeting_url} onChange={e=>setForm({...form,meeting_url:e.target.value})}/></div>}<div className="agenda-modal-footer"><button type="button" className="button" onClick={()=>setOpen(false)}>Cancelar</button><button className="button button-primary">Agendar</button></div></form></div>}
  </div>;
}
