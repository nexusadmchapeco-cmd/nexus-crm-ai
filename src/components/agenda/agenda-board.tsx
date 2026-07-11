"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type {
  Appointment,
  AppointmentStatus,
  CalendarBlock,
  Lead,
} from "@/lib/types";

const timezone = "America/Sao_Paulo";
const weekdayShort = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const labels: Record<AppointmentStatus, string> = {
  scheduled: "Aguardando",
  confirmed: "Confirmado",
  completed: "Realizado",
  no_show: "Não compareceu",
  cancelled: "Cancelado",
};

function localDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateFromKey(key: string) {
  return new Date(`${key}T12:00:00-03:00`);
}

function addDays(key: string, amount: number) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

function mondayOf(key: string) {
  const date = dateFromKey(key);
  const weekday = date.getDay();
  date.setDate(date.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  return localDateKey(date);
}

function timeKey(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function isoAt(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

function slotTimes() {
  const result: string[] = [];
  for (let minutes = 7 * 60; minutes < 22 * 60; minutes += 30) {
    result.push(
      `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    );
  }
  return result;
}

export function AgendaBoard({
  appointments: initial,
  blocks: initialBlocks,
  leads,
  migrationMissing,
  blocksMigrationMissing,
}: {
  appointments: Appointment[];
  blocks: CalendarBlock[];
  leads: Lead[];
  migrationMissing: boolean;
  blocksMigrationMissing: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [anchorDate, setAnchorDate] = useState(localDateKey());
  const [modal, setModal] = useState<"appointment" | "block" | null>(null);
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slotMenu, setSlotMenu] = useState<{ day: string; time: string } | null>(null);
  const [form, setForm] = useState({
    type: "closer_meeting",
    lead_id: "",
    title: "Reunião comercial",
    date: localDateKey(),
    time: "14:00",
    owner_name: "Closer Nexus",
    meeting_url: "",
  });
  const [blockForm, setBlockForm] = useState({
    date: localDateKey(),
    time: "14:00",
    duration: "30",
    reason: "Agenda fechada",
  });

  const weekStart = mondayOf(anchorDate);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );
  const times = useMemo(slotTimes, []);
  const weekEnd = addDays(weekStart, 7);
  const weekItems = items.filter((item) => {
    const key = localDateKey(new Date(item.starts_at));
    return key >= weekStart && key < weekEnd;
  });
  const selected = items.find((item) => item.id === selectedId) || null;

  function openAppointment(date: string, time: string) {
    setForm((current) => ({ ...current, date, time }));
    setModal("appointment");
    setNotice("");
  }

  function openBlock(date = anchorDate, time = "14:00") {
    setBlockForm((current) => ({ ...current, date, time }));
    setModal("block");
    setNotice("");
  }

  async function createAppointment() {
    const starts = new Date(isoAt(form.date, form.time));
    const ends = new Date(starts.getTime() + 30 * 60_000);
    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
      }),
    });
    const body = await response.json();
    if (!response.ok) return setNotice(body.error);
    setItems((current) =>
      [...current, body].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    );
    setModal(null);
    setNotice("Atendimento de 30 minutos agendado.");
  }

  async function createBlock() {
    const allDay = blockForm.duration === "day";
    const starts = new Date(
      allDay ? `${blockForm.date}T00:00:00-03:00` : isoAt(blockForm.date, blockForm.time),
    );
    const ends = allDay
      ? new Date(`${addDays(blockForm.date, 1)}T00:00:00-03:00`)
      : new Date(starts.getTime() + Number(blockForm.duration) * 60_000);
    const response = await fetch("/api/calendar-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        reason: blockForm.reason,
      }),
    });
    const body = await response.json();
    if (!response.ok) return setNotice(body.error);
    setBlocks((current) => [...current, body]);
    setModal(null);
    setNotice(allDay ? "Dia fechado para atendimentos." : "Horário bloqueado.");
  }

  async function quickBlock(date: string, time: string) {
    const starts = new Date(isoAt(date, time));
    const ends = new Date(starts.getTime() + 30 * 60_000);
    const response = await fetch("/api/calendar-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        reason: "Agenda fechada",
      }),
    });
    const body = await response.json();
    if (!response.ok) return setNotice(body.error);
    setBlocks((current) => [...current, body]);
    setNotice("Horário bloqueado.");
  }

  async function removeBlock(id: string) {
    const response = await fetch(`/api/calendar-blocks/${id}`, { method: "DELETE" });
    if (!response.ok) return;
    setBlocks((current) => current.filter((block) => block.id !== id));
    setNotice("Agenda reaberta.");
  }

  async function changeStatus(id: string, status: AppointmentStatus) {
    const response = await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = await response.json();
    if (!response.ok) return setNotice(body.error);
    setItems((current) => current.map((item) => (item.id === id ? body : item)));
  }

  if (migrationMissing) {
    return (
      <div className="config-required">
        <Icon name="calendar" size={28} />
        <h2>Agenda pronta para ativação</h2>
        <p>Execute a migration da agenda no Supabase.</p>
      </div>
    );
  }

  return (
    <div className="agenda-shell">
      <section className="agenda-toolbar week-toolbar">
        <div className="week-navigation">
          <button className="icon-button" onClick={() => setAnchorDate(addDays(weekStart, -7))} aria-label="Semana anterior">‹</button>
          <div className="agenda-date">
            <label htmlFor="agenda-date">Semana de</label>
            <input id="agenda-date" type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} />
          </div>
          <button className="icon-button" onClick={() => setAnchorDate(addDays(weekStart, 7))} aria-label="Próxima semana">›</button>
          <button className="button week-today" onClick={() => setAnchorDate(localDateKey())}>Hoje</button>
        </div>
        <div className="agenda-legend">
          <span><i className="meeting" /> Reunião</span>
          <span><i className="class" /> Aula experimental</span>
          <span><i className="blocked" /> Agenda fechada</span>
        </div>
        <div className="week-actions">
          {!blocksMigrationMissing && <button className="button" onClick={() => openBlock()}><Icon name="x" size={13} /> Fechar agenda</button>}
          <button className="button button-primary" onClick={() => openAppointment(anchorDate, "14:00")}><Icon name="plus" size={15} /> Novo compromisso</button>
        </div>
      </section>

      <div className="agenda-kpis">
        <div><span>Reuniões na semana</span><strong>{weekItems.filter((item) => item.type === "closer_meeting").length}</strong></div>
        <div><span>Aulas experimentais</span><strong>{weekItems.filter((item) => item.type === "experimental_class").length}</strong></div>
        <div><span>Realizados</span><strong>{weekItems.filter((item) => item.status === "completed").length}</strong></div>
        <div><span>Horários bloqueados</span><strong>{blocks.filter((block) => block.starts_at < `${weekEnd}T03:00:00.000Z` && block.ends_at > `${weekStart}T03:00:00.000Z`).length}</strong></div>
      </div>

      <section className="week-calendar" aria-label="Agenda semanal">
        <div className="week-grid week-grid-header">
          <div className="week-corner">BRASÍLIA</div>
          {days.map((day, index) => (
            <div key={day} className={day === localDateKey() ? "today" : ""}>
              <span>{weekdayShort[index]}</span>
              <strong>{dateFromKey(day).getDate()}</strong>
              <small>{dateFromKey(day).toLocaleDateString("pt-BR", { month: "short" })}</small>
            </div>
          ))}
        </div>
        <div className="week-grid-body">
          {times.map((time) => (
            <div className="week-grid week-row" key={time}>
              <time>{time}</time>
              {days.map((day) => {
                const start = new Date(isoAt(day, time));
                const end = new Date(start.getTime() + 30 * 60_000);
                const appointment = items.find(
                  (item) =>
                    localDateKey(new Date(item.starts_at)) === day &&
                    timeKey(item.starts_at) === time &&
                    item.status !== "cancelled",
                );
                const block = blocks.find(
                  (item) =>
                    new Date(item.starts_at) < end &&
                    new Date(item.ends_at) > start,
                );
                return (
                  <div className={`week-cell ${day === localDateKey() ? "today" : ""}`} key={`${day}-${time}`}>
                    {appointment ? (
                      <button
                        className={`week-appointment ${appointment.type === "closer_meeting" ? "meeting" : "class"}`}
                        onClick={() => setSelectedId(appointment.id)}
                        title={`${appointment.title} — ${appointment.leads?.name || "Sem lead"}`}
                      >
                        <strong>{appointment.leads?.name || appointment.title}</strong>
                        <small>{time} · {appointment.owner_name || "Equipe"}</small>
                      </button>
                    ) : block ? (
                      <div className="week-block" title={block.reason}>
                        <span>Fechado</span>
                        <button onClick={() => removeBlock(block.id)} aria-label="Reabrir horário">×</button>
                      </div>
                    ) : (
                      <>
                        <button
                          className="week-empty-slot"
                          onClick={() =>
                            setSlotMenu((current) =>
                              current?.day === day && current?.time === time ? null : { day, time },
                            )
                          }
                          aria-label={`Opções para ${day} às ${time}`}
                        >
                          +
                        </button>
                        {slotMenu?.day === day && slotMenu?.time === time && (
                          <>
                            <button
                              type="button"
                              className="week-slot-menu-backdrop"
                              onClick={() => setSlotMenu(null)}
                              aria-label="Fechar menu"
                            />
                            <div className="week-slot-menu">
                              <button
                                type="button"
                                onClick={() => {
                                  setSlotMenu(null);
                                  openAppointment(day, time);
                                }}
                              >
                                <Icon name="calendar" size={12} /> Agendar compromisso
                              </button>
                              <button
                                type="button"
                                className="week-slot-menu-close"
                                onClick={() => {
                                  setSlotMenu(null);
                                  void quickBlock(day, time);
                                }}
                              >
                                <Icon name="x" size={12} /> Fechar horário
                              </button>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {selected && (
        <section className="week-selected">
          <div>
            <span>{selected.type === "closer_meeting" ? "Reunião comercial" : "Aula experimental"}</span>
            <h2>{selected.leads?.name || selected.title}</h2>
            <p>{new Date(selected.starts_at).toLocaleString("pt-BR", { timeZone: timezone, dateStyle: "full", timeStyle: "short" })} · 30 minutos · {labels[selected.status]}</p>
          </div>
          <div className="agenda-actions">
            {selected.meeting_url && <a href={selected.meeting_url} target="_blank" rel="noreferrer">Abrir Meet</a>}
            <button onClick={() => changeStatus(selected.id, "completed")}>Confirmar realização</button>
            <button className="muted" onClick={() => changeStatus(selected.id, "no_show")}>Não compareceu</button>
            <button className="icon-button" onClick={() => setSelectedId(null)} aria-label="Fechar detalhes"><Icon name="x" size={12} /></button>
          </div>
        </section>
      )}

      {notice && <div className="studio-notice ok">{notice}</div>}

      {modal === "appointment" && (
        <div className="agenda-modal-backdrop">
          <form className="agenda-modal" onSubmit={(event) => { event.preventDefault(); createAppointment(); }}>
            <div className="agenda-modal-head">
              <div><span>Novo compromisso</span><h2>Agendar atendimento</h2></div>
              <button type="button" className="icon-button" onClick={() => setModal(null)}><Icon name="x" /></button>
            </div>
            <div className="operations-callout"><Icon name="calendar" size={15} /><div><strong>Duração padronizada</strong><p>Todos os atendimentos ocupam 30 minutos no horário de Brasília.</p></div></div>
            <div className="field-grid">
              <div className="field"><label>Tipo</label><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value, title: event.target.value === "closer_meeting" ? "Reunião comercial" : "Aula experimental" })}><option value="closer_meeting">Reunião com closer</option><option value="experimental_class">Aula experimental</option></select></div>
              <div className="field"><label>Lead</label><select value={form.lead_id} onChange={(event) => setForm({ ...form, lead_id: event.target.value })}><option value="">Selecionar lead</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name || lead.phone}</option>)}</select></div>
            </div>
            <div className="field"><label>Título</label><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>
            <div className="field-grid">
              <div className="field"><label>Data</label><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></div>
              <div className="field"><label>Horário</label><input type="time" step="1800" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></div>
            </div>
            <div className="field"><label>Responsável</label><input value={form.owner_name} onChange={(event) => setForm({ ...form, owner_name: event.target.value })} /></div>
            {form.type === "closer_meeting" && <div className="field"><label>Link do Google Meet</label><input placeholder="https://meet.google.com/..." value={form.meeting_url} onChange={(event) => setForm({ ...form, meeting_url: event.target.value })} /></div>}
            {notice && <div className="studio-notice warning">{notice}</div>}
            <div className="agenda-modal-footer"><button type="button" className="button" onClick={() => setModal(null)}>Cancelar</button><button className="button button-primary">Agendar 30 minutos</button></div>
          </form>
        </div>
      )}

      {modal === "block" && (
        <div className="agenda-modal-backdrop">
          <form className="agenda-modal" onSubmit={(event) => { event.preventDefault(); createBlock(); }}>
            <div className="agenda-modal-head">
              <div><span>Indisponibilidade</span><h2>Fechar agenda</h2></div>
              <button type="button" className="icon-button" onClick={() => setModal(null)}><Icon name="x" /></button>
            </div>
            <div className="field-grid">
              <div className="field"><label>Data</label><input type="date" value={blockForm.date} onChange={(event) => setBlockForm({ ...blockForm, date: event.target.value })} /></div>
              <div className="field"><label>Período</label><select value={blockForm.duration} onChange={(event) => setBlockForm({ ...blockForm, duration: event.target.value })}><option value="30">30 minutos</option><option value="60">1 hora</option><option value="120">2 horas</option><option value="day">Dia inteiro</option></select></div>
            </div>
            {blockForm.duration !== "day" && <div className="field"><label>Horário inicial</label><input type="time" step="1800" value={blockForm.time} onChange={(event) => setBlockForm({ ...blockForm, time: event.target.value })} /></div>}
            <div className="field"><label>Motivo</label><input value={blockForm.reason} onChange={(event) => setBlockForm({ ...blockForm, reason: event.target.value })} placeholder="Feriado, reunião interna, indisponibilidade..." /></div>
            {notice && <div className="studio-notice warning">{notice}</div>}
            <div className="agenda-modal-footer"><button type="button" className="button" onClick={() => setModal(null)}>Cancelar</button><button className="button button-primary">Confirmar bloqueio</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
