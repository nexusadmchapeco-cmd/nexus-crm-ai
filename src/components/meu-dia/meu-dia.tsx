"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";

export type DiaItem = {
  task_id: string | null;
  lead_id: string;
  lead_name: string | null;
  phone: string;
  stage: string | null;
  reason: string;
  due_at?: string | null;
};

export type AgendaItem = {
  id: string;
  title: string;
  type: string;
  starts_at: string;
  lead_id: string | null;
  lead_name: string | null;
  phone: string | null;
};

const SHORTCUTS = [
  { key: "1", label: "Amanhã", days: 1 },
  { key: "3", label: "Em 3 dias", days: 3 },
  { key: "7", label: "Em 1 semana", days: 7 },
];

function shortcutToISO(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function MeuDia({
  overdue,
  today,
  noResponse,
  agenda,
}: {
  overdue: DiaItem[];
  today: DiaItem[];
  noResponse: DiaItem[];
  agenda: AgendaItem[];
}) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<DiaItem | null>(null);
  const [note, setNote] = useState("");
  const [nextContact, setNextContact] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keyOf = (item: DiaItem) => item.task_id || `lead-${item.lead_id}`;

  async function complete() {
    if (!active || !note.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = active.task_id
        ? await fetch(`/api/leads/${active.lead_id}/tasks/${active.task_id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "done", done_note: note, next_contact_at: nextContact }),
          })
        : await fetch(`/api/leads/${active.lead_id}/notes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: note, outcome: "atendeu", next_contact_at: nextContact }),
          });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao concluir.");
      setDone((current) => new Set(current).add(keyOf(active)));
      setActive(null);
      setNote("");
      setNextContact(null);
      router.refresh();
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "Erro ao concluir.");
    } finally {
      setSaving(false);
    }
  }

  function renderBlock(title: string, items: DiaItem[], tone: string) {
    const visible = items.filter((item) => !done.has(keyOf(item)));
    return (
      <section className={`dia-block dia-${tone}`}>
        <div className="dia-block-head">
          <h3>{title}</h3>
          <span>{visible.length}</span>
        </div>
        {visible.length === 0 ? (
          <p className="dia-empty">Nada por aqui.</p>
        ) : (
          <ul className="dia-list">
            {visible.map((item) => (
              <li key={keyOf(item)} className="dia-row">
                <div className="dia-row-main">
                  <strong>{item.lead_name || item.phone}</strong>
                  <span className="dia-meta">
                    {item.stage || "Sem etapa"} · {item.reason}
                  </span>
                </div>
                <div className="dia-row-actions">
                  <Link href={`/conversations?lead=${item.lead_id}`} className="dia-btn ghost">
                    Abrir conversa
                  </Link>
                  <button type="button" className="dia-btn" onClick={() => setActive(item)}>
                    Concluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="dia-shell">
      {renderBlock("Atrasado", overdue, "late")}
      {renderBlock("Hoje", today, "today")}
      {renderBlock("Sem resposta há +3 dias", noResponse, "stale")}

      <section className="dia-block dia-agenda">
        <div className="dia-block-head">
          <h3>Agenda de hoje</h3>
          <span>{agenda.length}</span>
        </div>
        {agenda.length === 0 ? (
          <p className="dia-empty">Nenhum compromisso hoje.</p>
        ) : (
          <ul className="dia-list">
            {agenda.map((item) => (
              <li key={item.id} className="dia-row">
                <div className="dia-row-main">
                  <strong>
                    {timeLabel(item.starts_at)} · {item.lead_name || item.phone || "Lead"}
                  </strong>
                  <span className="dia-meta">
                    {item.type === "closer_meeting" ? "Reunião com closer" : "Aula experimental"}
                  </span>
                </div>
                {item.lead_id && (
                  <div className="dia-row-actions">
                    <Link href={`/conversations?lead=${item.lead_id}`} className="dia-btn ghost">
                      Abrir conversa
                    </Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {active && (
        <div className="dia-modal-backdrop" onClick={() => setActive(null)}>
          <div className="dia-modal" onClick={(event) => event.stopPropagation()}>
            <div className="dia-modal-head">
              <h4>Concluir contato — {active.lead_name || active.phone}</h4>
              <button type="button" onClick={() => setActive(null)} aria-label="Fechar">
                <Icon name="x" size={15} />
              </button>
            </div>
            {error && <div className="dia-modal-error">{error}</div>}
            <textarea
              placeholder="Observação do contato (obrigatória)"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="dia-modal-schedule">
              <span>Agendar próximo contato:</span>
              <div className="schedule-chips">
                {SHORTCUTS.map((shortcut) => {
                  const iso = shortcutToISO(shortcut.days);
                  const activeChip = nextContact === iso;
                  return (
                    <button
                      type="button"
                      key={shortcut.key}
                      className={activeChip ? "active" : ""}
                      onClick={() => setNextContact(activeChip ? null : iso)}
                    >
                      {shortcut.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              className="dia-modal-save"
              disabled={saving || !note.trim()}
              onClick={() => void complete()}
            >
              {saving ? "Salvando..." : "Salvar e concluir"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
