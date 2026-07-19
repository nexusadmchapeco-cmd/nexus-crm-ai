"use client";

import Link from "next/link";
import { useEffect, useState, type DragEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { formatRelative, initials, labelEventType, labelTemperature } from "@/lib/format";
import type { FollowupHistoryItem, Lead, LeadEvent, PipelineStage } from "@/lib/types";

type Props = {
  initialLeads: Lead[];
  stages: PipelineStage[];
  followups: FollowupHistoryItem[];
  events: Record<string, LeadEvent[]>;
};

export function KanbanBoard({ initialLeads, stages, followups, events }: Props) {
  const [leads, setLeads] = useState(initialLeads);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dropStageId, setDropStageId] = useState<string | null>(null);
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);

  useEffect(() => {
    // initialLeads muda a cada AutoRefresh (novo fetch no servidor); não mexe
    // durante um drag/exclusão em andamento para não sobrescrever a ação local.
    if (movingLeadId || deletingLeadId || draggedLeadId) return;
    setLeads(initialLeads);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLeads]);
  const [notice, setNotice] = useState<string | null>(null);

  async function deleteLead(lead: Lead) {
    const confirmed = window.confirm(
      `Excluir o lead ${lead.name || lead.phone}? Isso apaga a conversa e o histórico. Não pode ser desfeito.`,
    );
    if (!confirmed) return;
    setDeletingLeadId(lead.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível excluir o lead.");
      setLeads((current) => current.filter((item) => item.id !== lead.id));
      setNotice(`Lead ${lead.name || lead.phone} excluído.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível excluir o lead.");
    } finally {
      setDeletingLeadId(null);
    }
  }

  async function moveLead(leadId: string, stageId: string) {
    const lead = leads.find((item) => item.id === leadId);
    if (!lead || lead.stage_id === stageId || movingLeadId) return;

    const previousStageId = lead.stage_id;
    setMovingLeadId(leadId);
    setNotice(null);
    setLeads((current) =>
      current.map((item) => (item.id === leadId ? { ...item, stage_id: stageId } : item)),
    );

    try {
      const response = await fetch(`/api/leads/${leadId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: stageId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível mover o lead.");
      const stageName = stages.find((stage) => stage.id === stageId)?.name || "nova etapa";
      setNotice(`Lead movido para ${stageName}.`);
    } catch (error) {
      setLeads((current) =>
        current.map((item) =>
          item.id === leadId ? { ...item, stage_id: previousStageId } : item,
        ),
      );
      setNotice(error instanceof Error ? error.message : "Não foi possível mover o lead.");
    } finally {
      setMovingLeadId(null);
      setDraggedLeadId(null);
      setDropStageId(null);
    }
  }

  function startDragging(event: DragEvent<HTMLElement>, leadId: string) {
    setDraggedLeadId(leadId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", leadId);
  }

  function dropLead(event: DragEvent<HTMLElement>, stageId: string) {
    event.preventDefault();
    const leadId = event.dataTransfer.getData("text/plain") || draggedLeadId;
    if (leadId) void moveLead(leadId, stageId);
  }

  function renderColumn(stage: PipelineStage) {
    const stageLeads = leads.filter((lead) => lead.stage_id === stage.id);
    const isDropTarget = dropStageId === stage.id && draggedLeadId;
    return (
      <section
        className={`kanban-column ${isDropTarget ? "kanban-column-drop" : ""}`}
        key={stage.id}
        style={{ "--stage-color": stage.color } as React.CSSProperties}
        onDragEnter={() => setDropStageId(stage.id)}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDropStageId(null);
          }
        }}
        onDrop={(event) => dropLead(event, stage.id)}
      >
        <div className="kanban-head">
          <i />
          <strong>{stage.name}</strong>
          <span className="kanban-count">{stageLeads.length}</span>
        </div>
        <div className="kanban-card-list">
          {stageLeads.map((lead) => {
            const history = events[lead.id] || [];
            const historyOpen = openHistoryId === lead.id;
            return (
              <article
                className={`lead-card ${draggedLeadId === lead.id ? "lead-card-dragging" : ""}`}
                key={lead.id}
                draggable
                onDragStart={(event) => startDragging(event, lead.id)}
                onDragEnd={() => {
                  setDraggedLeadId(null);
                  setDropStageId(null);
                }}
              >
                <Link href={`/conversations?lead=${lead.id}`} className="lead-card-link">
                  <div className="lead-card-top">
                    <div className="avatar">{initials(lead.name, lead.phone)}</div>
                    <div>
                      <strong>{lead.name || lead.phone}</strong>
                      <span>{lead.city || lead.unit_interest || "Local não informado"}</span>
                    </div>
                    <Icon name="move" size={14} className="lead-drag-icon" />
                  </div>
                  <span className={`temperature ${lead.temperature}`}>
                    {labelTemperature(lead.temperature)}
                  </span>
                  {followups.some((item) => item.lead_id === lead.id) && (
                    <div className="followup-badges" aria-label="Histórico de follow-up">
                      {followups
                        .filter((item) => item.lead_id === lead.id)
                        .slice(-4)
                        .map((item) => (
                          <span key={item.id}>{item.label}</span>
                        ))}
                    </div>
                  )}
                  <div className="lead-card-detail">
                    {lead.objective || "Aguardando identificação do objetivo"}
                  </div>
                  <div className="lead-card-footer">
                    <span>{lead.source || "Direto"}</span>
                    <span>{formatRelative(lead.last_message_at)}</span>
                  </div>
                </Link>
                {history.length > 0 && (
                  <div className="lead-card-history">
                    <button
                      type="button"
                      className="lead-card-history-toggle"
                      onClick={() => setOpenHistoryId(historyOpen ? null : lead.id)}
                    >
                      <Icon name="report" size={11} />
                      Histórico de contatos ({history.length})
                      <Icon name="arrow" size={11} className={historyOpen ? "arrow-down" : ""} />
                    </button>
                    {historyOpen && (
                      <ul className="lead-card-history-list">
                        {history.map((item) => (
                          <li key={item.id}>
                            <span>{labelEventType(item.event_type)}</span>
                            <time>{formatRelative(item.created_at)}</time>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <div className="lead-card-controls">
                  <label className="lead-stage-select">
                    <span>Mover para</span>
                    <select
                      value={lead.stage_id}
                      disabled={movingLeadId === lead.id}
                      onChange={(event) => void moveLead(lead.id, event.target.value)}
                    >
                      {stages.map((option) => (
                        <option key={option.id} value={option.id}>{option.name}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="icon-button lead-card-delete"
                    aria-label={`Excluir lead ${lead.name || lead.phone}`}
                    disabled={deletingLeadId === lead.id}
                    onClick={() => void deleteLead(lead)}
                  >
                    <Icon name="x" size={13} />
                  </button>
                </div>
              </article>
            );
          })}
          {!stageLeads.length && (
            <div className="kanban-empty">
              {isDropTarget ? "Solte o lead aqui" : "Nenhum lead nesta etapa"}
            </div>
          )}
        </div>
      </section>
    );
  }

  const visibleStages = stages.filter((stage) => stage.board_visible);
  const iaStages = visibleStages.filter((stage) => stage.board_group === "ia");
  const closerStages = visibleStages.filter((stage) => stage.board_group === "closer");

  return (
    <div className="kanban-sections">
      {notice && <div className="kanban-notice" role="status">{notice}</div>}
      <div className="kanban-section kanban-section-ia">
        <div className="kanban-section-label">
          Atendimento da IA
          <em>arraste um cartão ou use “Mover para”</em>
        </div>
        <div
          className="kanban-grid"
          style={{ "--kanban-cols": iaStages.length } as React.CSSProperties}
        >
          {iaStages.map(renderColumn)}
        </div>
      </div>
      <div className="kanban-section kanban-section-closer">
        <div className="kanban-section-label kanban-section-label-closer">Closer · manual</div>
        <div
          className="kanban-grid"
          style={{ "--kanban-cols": closerStages.length } as React.CSSProperties}
        >
          {closerStages.map(renderColumn)}
        </div>
      </div>
    </div>
  );
}
