"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { AvailabilitySlot } from "@/lib/types";

const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type CalendarBlockRow = {
  id: string;
  recurring: boolean;
  weekday: number | null;
  start_time: string | null;
  end_time: string | null;
  until: string | null;
  starts_at: string | null;
  ends_at: string | null;
  reason: string | null;
};

export function AvailabilityManager({
  initial,
  blocks: initialBlocks = [],
}: {
  initial: AvailabilitySlot[];
  blocks?: CalendarBlockRow[];
}) {
  const [items, setItems] = useState(initial);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockForm, setBlockForm] = useState({
    mode: "pontual",
    date: "",
    weekday: "1",
    start_time: "08:00",
    end_time: "12:00",
    until: "",
    reason: "",
  });

  async function saveBlock() {
    const isRecurring = blockForm.mode === "recorrente";
    const body = isRecurring
      ? {
          recurring: true,
          weekday: Number(blockForm.weekday),
          start_time: blockForm.start_time,
          end_time: blockForm.end_time,
          until: blockForm.until || null,
          reason: blockForm.reason,
        }
      : {
          recurring: false,
          starts_at: `${blockForm.date}T${blockForm.start_time}:00-03:00`,
          ends_at: `${blockForm.date}T${blockForm.end_time}:00-03:00`,
          reason: blockForm.reason,
        };
    if (!isRecurring && !blockForm.date) return setNotice("Escolha a data do bloqueio.");
    const response = await fetch("/api/calendar-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) return setNotice(data.error || "Erro ao fechar agenda.");
    setBlocks((current) => [...current, data]);
    setBlockOpen(false);
    setNotice("Agenda fechada — a IA não oferece horários nesse período.");
  }

  async function removeBlock(id: string) {
    const response = await fetch(`/api/calendar-blocks/${id}`, { method: "DELETE" });
    if (response.ok) setBlocks((current) => current.filter((item) => item.id !== id));
  }
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

      <div className="campaign-section-title" style={{ marginTop: 22 }}>
        <div>
          <span>Fechar agenda</span>
          <h2>Períodos em que a IA não agenda</h2>
        </div>
        <button className="button" onClick={() => setBlockOpen(!blockOpen)}>
          <Icon name="lock" size={13} /> Fechar horário
        </button>
      </div>
      {blockOpen && (
        <form
          className="availability-form"
          onSubmit={(event) => {
            event.preventDefault();
            saveBlock();
          }}
        >
          <div className="field">
            <label>Tipo</label>
            <select value={blockForm.mode} onChange={(e) => setBlockForm({ ...blockForm, mode: e.target.value })}>
              <option value="pontual">Dia específico</option>
              <option value="recorrente">Recorrente (toda semana)</option>
            </select>
          </div>
          {blockForm.mode === "pontual" ? (
            <div className="field">
              <label>Data</label>
              <input type="date" value={blockForm.date} onChange={(e) => setBlockForm({ ...blockForm, date: e.target.value })} />
            </div>
          ) : (
            <div className="field">
              <label>Dia da semana</label>
              <select value={blockForm.weekday} onChange={(e) => setBlockForm({ ...blockForm, weekday: e.target.value })}>
                {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>Início</label>
            <input type="time" value={blockForm.start_time} onChange={(e) => setBlockForm({ ...blockForm, start_time: e.target.value })} />
          </div>
          <div className="field">
            <label>Fim</label>
            <input type="time" value={blockForm.end_time} onChange={(e) => setBlockForm({ ...blockForm, end_time: e.target.value })} />
          </div>
          {blockForm.mode === "recorrente" && (
            <div className="field">
              <label>Até quando (opcional)</label>
              <input type="date" value={blockForm.until} onChange={(e) => setBlockForm({ ...blockForm, until: e.target.value })} />
            </div>
          )}
          <button className="button button-primary">Fechar agenda</button>
        </form>
      )}
      <div className="availability-list">
        {!blocks.length && <p>Nenhum bloqueio ativo.</p>}
        {blocks.map((block) => (
          <div key={block.id}>
            <i className="blocked" />
            <strong>
              {block.recurring
                ? `Toda ${weekdays[block.weekday ?? 0]}`
                : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(block.starts_at || 0))}
            </strong>
            <span>
              {block.recurring
                ? `${String(block.start_time).slice(0, 5)}–${String(block.end_time).slice(0, 5)}${block.until ? ` · até ${block.until.split("-").reverse().join("/")}` : ""}`
                : `${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", timeStyle: "short" }).format(new Date(block.starts_at || 0))}–${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", timeStyle: "short" }).format(new Date(block.ends_at || 0))}`}
            </span>
            <small>{block.reason || "Agenda fechada"}</small>
            <button className="icon-button" onClick={() => removeBlock(block.id)} aria-label="Reabrir"><Icon name="x" size={12} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
