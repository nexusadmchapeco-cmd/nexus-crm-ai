"use client";

import { useEffect, useState, type DragEvent } from "react";
import { LeadModal } from "@/components/kanban/lead-modal";
import { Icon } from "@/components/ui/icon";
import { formatRelative, initials, labelEventType, labelTemperature } from "@/lib/format";
import type { FollowupHistoryItem, Lead, LeadEvent, PipelineStage } from "@/lib/types";

type Props = {
  initialLeads: Lead[];
  stages: PipelineStage[];
  followups: FollowupHistoryItem[];
  events: Record<string, LeadEvent[]>;
  authorName?: string | null;
  // Etapa "Não Qualificado" — habilita a aba Leads bucha (gestão).
  buchaStageId?: string | null;
};

export function KanbanBoard({ initialLeads, stages, followups, events, authorName = null, buchaStageId = null }: Props) {
  const [leads, setLeads] = useState(initialLeads);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dropStageId, setDropStageId] = useState<string | null>(null);
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

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
                className={`lead-card ${lead.modalidade ? `lead-card-${lead.modalidade}` : ""} ${draggedLeadId === lead.id ? "lead-card-dragging" : ""}`}
                key={lead.id}
                draggable
                onDragStart={(event) => startDragging(event, lead.id)}
                onDragEnd={() => {
                  setDraggedLeadId(null);
                  setDropStageId(null);
                }}
              >
                <button type="button" className="lead-card-link" onClick={() => setOpenLeadId(lead.id)}>
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
                  {lead.modalidade && (
                    <span className={`lead-tag ${lead.modalidade === "online" ? "tag-online" : "tag-presencial"}`}>
                      {lead.modalidade === "online" ? "Online" : "Presencial"}
                    </span>
                  )}
                  {(lead.tags || []).map((tag) => (
                    <span key={tag} className={`lead-tag ${tag === "Experimental" ? "tag-exp" : "tag-hard"}`}>
                      {tag}
                    </span>
                  ))}
                  {lead.opted_out_at && (
                    <span className="lead-opt-out" title="Lead pediu para sair (opt-out)">
                      Opt-out
                    </span>
                  )}
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
                </button>
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

  const openLead = openLeadId ? leads.find((lead) => lead.id === openLeadId) || null : null;

  // Aba Leads bucha (pipeline do closer): não qualificados da unidade dele —
  // material pra trabalhar quando o movimento está fraco. Sem encaminhamento,
  // sem aviso: ele abre a ficha e toca direto.
  const [view, setView] = useState<"funil" | "bucha">("funil");
  const buchaLeads = buchaStageId
    ? leads
        .filter((lead) => lead.stage_id === buchaStageId)
        .sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || ""))
    : [];

  const [cadastroOpen, setCadastroOpen] = useState(false);
  const [cadastro, setCadastro] = useState({
    name: "",
    phone: "",
    modalidade: "presencial",
    unit_interest: "Chapecó",
    course_interest: "",
    source: "Indicação",
    note: "",
  });
  const [cadastroBusy, setCadastroBusy] = useState(false);

  async function cadastrarLead() {
    if (cadastroBusy) return;
    setCadastroBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...cadastro,
          unit_interest: cadastro.modalidade === "online" ? "Online" : cadastro.unit_interest,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao cadastrar.");
      setLeads((current) => [data.lead, ...current]);
      setCadastroOpen(false);
      setCadastro({ ...cadastro, name: "", phone: "", note: "" });
      setNotice(`Lead ${data.lead.name} cadastrado.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Erro ao cadastrar.");
    } finally {
      setCadastroBusy(false);
    }
  }

  return (
    <div className="kanban-sections">
      <div className="kanban-toolbar">
        {buchaStageId && (
          <div className="kanban-views">
            <button type="button" className={view === "funil" ? "on" : ""} onClick={() => setView("funil")}>
              Funil
            </button>
            <button type="button" className={view === "bucha" ? "on" : ""} onClick={() => setView("bucha")}>
              Leads bucha {buchaLeads.length > 0 && <b>{buchaLeads.length}</b>}
            </button>
          </div>
        )}
        <button type="button" className="pv-btn pv-btn-sm" onClick={() => setCadastroOpen(true)}>
          ＋ Cadastrar lead
        </button>
      </div>
      {cadastroOpen && (
        <div className="dia-modal-backdrop" onClick={() => setCadastroOpen(false)}>
          <div className="dia-modal" onClick={(event) => event.stopPropagation()}>
            <div className="dia-modal-head">
              <h4>Cadastrar lead manual</h4>
              <button type="button" onClick={() => setCadastroOpen(false)} aria-label="Fechar">✕</button>
            </div>
            <div className="cadastro-grid">
              <input placeholder="Nome" value={cadastro.name} onChange={(e) => setCadastro({ ...cadastro, name: e.target.value })} />
              <input placeholder="Celular com DDD" inputMode="tel" value={cadastro.phone} onChange={(e) => setCadastro({ ...cadastro, phone: e.target.value })} />
              <select value={cadastro.modalidade} onChange={(e) => setCadastro({ ...cadastro, modalidade: e.target.value })}>
                <option value="presencial">Presencial</option>
                <option value="online">Online</option>
              </select>
              {cadastro.modalidade === "presencial" && (
                <select value={cadastro.unit_interest} onChange={(e) => setCadastro({ ...cadastro, unit_interest: e.target.value })}>
                  <option>Passo Fundo</option>
                  <option>Chapecó</option>
                </select>
              )}
              <select value={cadastro.course_interest} onChange={(e) => setCadastro({ ...cadastro, course_interest: e.target.value })}>
                <option value="">Curso (opcional)</option>
                <option>Nexus Class</option>
                <option>Nexus Flex</option>
                <option>Nexus Private</option>
                <option>Nexus Junior</option>
                <option>Nexus Travel</option>
              </select>
              <select value={cadastro.source} onChange={(e) => setCadastro({ ...cadastro, source: e.target.value })}>
                <option>Indicação</option>
                <option>Presencial</option>
                <option>Telefone</option>
                <option>Instagram</option>
                <option>Outro</option>
              </select>
              <textarea placeholder="Observação (opcional)" value={cadastro.note} onChange={(e) => setCadastro({ ...cadastro, note: e.target.value })} />
            </div>
            <button type="button" className="dia-modal-save" disabled={cadastroBusy || !cadastro.name.trim() || cadastro.phone.replace(/\D/g, "").length < 10} onClick={() => void cadastrarLead()}>
              {cadastroBusy ? "Salvando..." : "Cadastrar lead"}
            </button>
          </div>
        </div>
      )}
      {notice && <div className="kanban-notice" role="status">{notice}</div>}
      {openLead && (
        <LeadModal
          lead={openLead}
          stages={stages.filter((stage) => stage.board_visible)}
          authorName={authorName}
          onClose={() => setOpenLeadId(null)}
          onMove={(stageId) => void moveLead(openLead.id, stageId)}
          onDelete={() => {
            setOpenLeadId(null);
            void deleteLead(openLead);
          }}
        />
      )}
      {view === "bucha" && buchaStageId && (
        <div className="kanban-section">
          <div className="kanban-section-label">
            Leads bucha · não qualificados pela IA
            <em>pra trabalhar quando o movimento está fraco — abra a ficha e toque direto</em>
          </div>
          <div className="pv-card">
            {buchaLeads.length === 0 && <p className="dia-empty">Nenhum lead bucha na fila. 👏</p>}
            {buchaLeads.map((lead) => (
              <div className="pv-row" key={lead.id}>
                <button type="button" className="pv-nm pv-nm-click" onClick={() => setOpenLeadId(lead.id)}>
                  {lead.name || lead.phone}
                  <small>{lead.summary || lead.objective || "Sem resumo — abrir a ficha"}</small>
                </button>
                <div className="pv-row-actions">
                  <span className="pv-chip pv-c-orange">{formatRelative(lead.last_message_at)}</span>
                  <a
                    className="pv-btn-green pv-btn-sm"
                    href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {view === "funil" && iaStages.length > 0 && (
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
      )}
      {view === "funil" && closerStages.length > 0 && (
        <div className="kanban-section kanban-section-closer">
          {iaStages.length > 0 && <div className="kanban-section-label kanban-section-label-closer">Closer · manual</div>}
          <div
            className="kanban-grid"
            style={{ "--kanban-cols": closerStages.length } as React.CSSProperties}
          >
            {closerStages.map(renderColumn)}
          </div>
        </div>
      )}
    </div>
  );
}
