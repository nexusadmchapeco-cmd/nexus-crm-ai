"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { formatRelative, labelEventType } from "@/lib/format";
import type { LeadContactType, LeadNote, LeadNoteOutcome, LeadTask } from "@/lib/types";

type LeadEventLite = {
  id: string;
  event_type: string;
  created_at: string;
};

const CONTACT_LABELS: Record<LeadContactType, string> = {
  whatsapp: "WhatsApp",
  ligacao: "Ligação",
  presencial: "Presencial",
  email: "E-mail",
  outro: "Outro",
};

const OUTCOME_LABELS: Record<LeadNoteOutcome, string> = {
  atendeu: "Atendeu",
  sem_resposta: "Sem resposta",
  vai_pensar: "Vai pensar",
  agendou: "Agendou",
  fechou: "Fechou",
  perdeu: "Perdeu",
};

type Shortcut = { key: string; label: string; days: number };
const SHORTCUTS: Shortcut[] = [
  { key: "tomorrow", label: "Amanhã", days: 1 },
  { key: "3d", label: "Em 3 dias", days: 3 },
  { key: "1w", label: "Em 1 semana", days: 7 },
];

function shortcutToISO(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function LeadHistory({ leadId }: { leadId: string }) {
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const [events, setEvents] = useState<LeadEventLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data) => setSessionName(data.user?.name || null))
      .catch(() => {});
  }, []);

  // Formulário de nova observação.
  const [contactType, setContactType] = useState<LeadContactType>("whatsapp");
  const [outcome, setOutcome] = useState<LeadNoteOutcome>("sem_resposta");
  const [content, setContent] = useState("");
  const [nextContact, setNextContact] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Conclusão de tarefa (observação obrigatória).
  const [doneTaskId, setDoneTaskId] = useState<string | null>(null);
  const [doneNote, setDoneNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/leads/${leadId}/notes`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao carregar.");
      setNotes(data.notes || []);
      setTasks(data.tasks || []);
      setEvents(data.events || []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingTasks = useMemo(
    () => tasks.filter((task) => task.status === "pending"),
    [tasks],
  );

  // Timeline unificada: observações + eventos + tarefas concluídas.
  const timeline = useMemo(() => {
    const items: { id: string; at: string; node: React.ReactNode }[] = [];
    for (const note of notes) {
      items.push({
        id: `note-${note.id}`,
        at: note.created_at,
        node: (
          <div className="timeline-note">
            <div className="timeline-note-head">
              <span className="timeline-tag">{CONTACT_LABELS[note.contact_type]}</span>
              <span className={`timeline-outcome outcome-${note.outcome}`}>
                {OUTCOME_LABELS[note.outcome]}
              </span>
              {note.author_name && <span className="timeline-author">{note.author_name}</span>}
            </div>
            <p>{note.content}</p>
          </div>
        ),
      });
    }
    for (const task of tasks.filter((item) => item.status !== "pending")) {
      items.push({
        id: `task-${task.id}`,
        at: task.done_at || task.created_at,
        node: (
          <div className="timeline-task-done">
            <Icon name={task.status === "done" ? "check" : "x"} size={12} />
            <span>
              {task.status === "done" ? "Tarefa concluída" : "Tarefa cancelada"}: {task.title}
            </span>
            {task.done_note && <p>{task.done_note}</p>}
          </div>
        ),
      });
    }
    for (const event of events) {
      items.push({
        id: `event-${event.id}`,
        at: event.created_at,
        node: <span className="timeline-event">{labelEventType(event.event_type)}</span>,
      });
    }
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [notes, tasks, events]);

  async function submitNote() {
    if (!content.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const nextContactAt =
        nextContact === "custom"
          ? customDate
            ? new Date(customDate).toISOString()
            : null
          : nextContact;
      const response = await fetch(`/api/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_type: contactType,
          outcome,
          content,
          next_contact_at: nextContactAt,
          author_name: sessionName,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao registrar.");
      setContent("");
      setNextContact(null);
      setCustomDate("");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Erro ao registrar.");
    } finally {
      setSaving(false);
    }
  }

  async function completeTask(taskId: string) {
    if (!doneNote.trim()) {
      setError("Escreva a observação do contato para concluir.");
      return;
    }
    setError(null);
    try {
      const response = await fetch(`/api/leads/${leadId}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "done",
          done_note: doneNote,
          outcome: "atendeu",
          author_name: sessionName,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao concluir.");
      setDoneTaskId(null);
      setDoneNote("");
      await load();
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "Erro ao concluir.");
    }
  }

  async function cancelTask(taskId: string) {
    try {
      const response = await fetch(`/api/leads/${leadId}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "canceled" }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao cancelar.");
      }
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Erro ao cancelar.");
    }
  }

  return (
    <div className="lead-history">
      {error && <div className="lead-history-error">{error}</div>}

      {pendingTasks.length > 0 && (
        <div className="lead-history-pending">
          <h5>Próximos contatos agendados</h5>
          {pendingTasks.map((task) => (
            <div key={task.id} className="pending-task">
              <div className="pending-task-top">
                <div>
                  <strong>{task.title}</strong>
                  <span>{formatDateTime(task.due_at)}</span>
                </div>
                <div className="pending-task-actions">
                  <button type="button" onClick={() => setDoneTaskId(doneTaskId === task.id ? null : task.id)}>
                    Concluir
                  </button>
                  <button type="button" className="ghost" onClick={() => void cancelTask(task.id)}>
                    Cancelar
                  </button>
                </div>
              </div>
              {doneTaskId === task.id && (
                <div className="pending-task-done">
                  <textarea
                    placeholder="Observação do contato (obrigatória)"
                    value={doneNote}
                    onChange={(event) => setDoneNote(event.target.value)}
                  />
                  <button type="button" onClick={() => void completeTask(task.id)}>
                    Salvar e concluir
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="lead-history-form">
        <h5>Registrar contato</h5>
        <div className="lead-history-selects">
          <select value={contactType} onChange={(event) => setContactType(event.target.value as LeadContactType)}>
            {(Object.keys(CONTACT_LABELS) as LeadContactType[]).map((key) => (
              <option key={key} value={key}>{CONTACT_LABELS[key]}</option>
            ))}
          </select>
          <select value={outcome} onChange={(event) => setOutcome(event.target.value as LeadNoteOutcome)}>
            {(Object.keys(OUTCOME_LABELS) as LeadNoteOutcome[]).map((key) => (
              <option key={key} value={key}>{OUTCOME_LABELS[key]}</option>
            ))}
          </select>
        </div>
        <textarea
          placeholder="O que rolou nesse contato?"
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <div className="lead-history-schedule">
          <span>Agendar próximo contato:</span>
          <div className="schedule-chips">
            {SHORTCUTS.map((shortcut) => {
              const iso = shortcutToISO(shortcut.days);
              const active = nextContact === iso;
              return (
                <button
                  type="button"
                  key={shortcut.key}
                  className={active ? "active" : ""}
                  onClick={() => setNextContact(active ? null : iso)}
                >
                  {shortcut.label}
                </button>
              );
            })}
            <button
              type="button"
              className={nextContact === "custom" ? "active" : ""}
              onClick={() => setNextContact(nextContact === "custom" ? null : "custom")}
            >
              Escolher data
            </button>
          </div>
          {nextContact === "custom" && (
            <input
              type="datetime-local"
              value={customDate}
              onChange={(event) => setCustomDate(event.target.value)}
            />
          )}
        </div>
        <button
          type="button"
          className="lead-history-save"
          disabled={saving || !content.trim()}
          onClick={() => void submitNote()}
        >
          {saving ? "Salvando..." : "Salvar observação"}
        </button>
      </div>

      <div className="lead-history-timeline">
        <h5>Histórico</h5>
        {loading ? (
          <p className="lead-history-empty">Carregando...</p>
        ) : timeline.length === 0 ? (
          <p className="lead-history-empty">Nenhum registro ainda.</p>
        ) : (
          <ul>
            {timeline.map((item) => (
              <li key={item.id}>
                <div className="timeline-body">{item.node}</div>
                <time>{formatRelative(item.at)}</time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
