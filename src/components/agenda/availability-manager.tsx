"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { AvailabilitySlot } from "@/lib/types";

const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function AvailabilityManager({ initial }: { initial: AvailabilitySlot[] }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    weekday: "1",
    start_time: "09:00",
    end_time: "12:00",
    type: "closer_meeting",
    owner_name: "Closer Nexus",
    unit: "",
  });

  async function save() {
    const response = await fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json();
    if (!response.ok) return setNotice(body.error);
    setItems((current) =>
      [...current, body].sort(
        (a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time),
      ),
    );
    setOpen(false);
    setNotice("Disponibilidade liberada para a IA.");
  }

  async function remove(id: string) {
    const response = await fetch(`/api/availability/${id}`, { method: "DELETE" });
    if (response.ok) setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <section className="availability-panel">
      <div className="campaign-section-title">
        <div>
          <span>Agenda inteligente</span>
          <h2>Horários que a IA pode oferecer</h2>
        </div>
        <button className="button" onClick={() => setOpen(!open)}>
          <Icon name="plus" size={13} /> Liberar horário
        </button>
      </div>
      {open && (
        <form
          className="availability-form"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="field">
            <label>Dia</label>
            <select value={form.weekday} onChange={(e) => setForm({ ...form, weekday: e.target.value })}>
              {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Início</label>
            <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </div>
          <div className="field">
            <label>Fim</label>
            <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
          <div className="field">
            <label>Tipo</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="closer_meeting">Reunião com closer</option>
              <option value="experimental_class">Aula experimental</option>
            </select>
          </div>
          <div className="field">
            <label>Responsável</label>
            <input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
          </div>
          <button className="button button-primary">Salvar</button>
        </form>
      )}
      {notice && <div className="studio-notice ok">{notice}</div>}
      <div className="availability-list">
        {!items.length && <p>Nenhum horário liberado. A IA não oferecerá horários até você cadastrar.</p>}
        {items.map((item) => (
          <div key={item.id}>
            <i className={item.type === "closer_meeting" ? "meeting" : "class"} />
            <strong>{weekdays[item.weekday]}</strong>
            <span>{item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)}</span>
            <small>{item.type === "closer_meeting" ? "Reunião" : "Aula experimental"} · {item.owner_name || "Equipe Nexus"}</small>
            <button className="icon-button" onClick={() => remove(item.id)} aria-label="Remover"><Icon name="x" size={12} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
