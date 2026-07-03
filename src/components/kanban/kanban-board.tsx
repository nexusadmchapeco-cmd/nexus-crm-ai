"use client";

import Link from "next/link";
import { useState, type DragEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { formatRelative, initials, labelTemperature } from "@/lib/format";
import type { Lead, PipelineStage } from "@/lib/types";

type Props = {
  initialLeads: Lead[];
  stages: PipelineStage[];
};

export function KanbanBoard({ initialLeads, stages }: Props) {
  const [leads, setLeads] = useState(initialLeads);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dropStageId, setDropStageId] = useState<string | null>(null);
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  return (
    <>
      <div className="kanban-helper">
        <Icon name="move" size={14} />
        Arraste um cartão para outra coluna ou use o seletor “Mover para”.
      </div>
      {notice && <div className="kanban-notice" role="status">{notice}</div>}
      <div className="kanban-wrap">
        <div className="kanban-board">
          {stages.map((stage) => {
            const stageLeads = leads.filter((lead) => lead.stage_id === stage.id);
            const isDropTarget = dropStageId === stage.id && draggedLeadId;
            return (
              <section
                className={`kanban-column ${isDropTarget ? "kanban-column-drop" : ""}`}
                key={stage.id}
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
                <div
                  className="kanban-head"
                  style={{ "--stage-color": stage.color } as React.CSSProperties}
                >
                  <i />
                  <strong>{stage.name}</strong>
                  <span className="kanban-count">{stageLeads.length}</span>
                </div>
                <div className="kanban-card-list">
                  {stageLeads.map((lead) => (
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
                        <div className="lead-card-detail">
                          {lead.objective || "Aguardando identificação do objetivo"}
                        </div>
                        <div className="lead-card-footer">
                          <span>{lead.source || "Direto"}</span>
                          <span>{formatRelative(lead.last_message_at)}</span>
                        </div>
                      </Link>
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
                    </article>
                  ))}
                  {!stageLeads.length && (
                    <div className="kanban-empty">
                      {isDropTarget ? "Solte o lead aqui" : "Nenhum lead nesta etapa"}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
