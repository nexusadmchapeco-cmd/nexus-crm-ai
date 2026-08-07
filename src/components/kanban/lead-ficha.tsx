"use client";

// Abre a ficha completa do lead (o mesmo modal do Kanban) a partir de
// qualquer tela — painel do vendedor, agenda. Busca o lead + etapas na API e
// entrega o LeadModal pronto, com mover/excluir funcionando.

import { useCallback, useEffect, useState } from "react";
import { LeadModal } from "@/components/kanban/lead-modal";
import type { Lead, PipelineStage } from "@/lib/types";

export function LeadFicha({
  leadId,
  authorName = null,
  onClose,
  onChanged,
}: {
  leadId: string;
  authorName?: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/leads/${leadId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao carregar o lead.");
      setLead(data.lead);
      setStages((data.stages || []).filter((stage: PipelineStage) => stage.board_visible));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar o lead.");
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(stageId: string) {
    try {
      const response = await fetch(`/api/leads/${leadId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: stageId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível mover o lead.");
      setLead((current) => (current ? { ...current, stage_id: stageId } : current));
      onChanged?.();
    } catch (moveError) {
      window.alert(moveError instanceof Error ? moveError.message : "Não foi possível mover o lead.");
    }
  }

  async function remove() {
    if (!lead) return;
    const confirmed = window.confirm(
      `Excluir o lead ${lead.name || lead.phone}? Isso apaga a conversa e o histórico. Não pode ser desfeito.`,
    );
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível excluir o lead.");
      onChanged?.();
      onClose();
    } catch (removeError) {
      window.alert(removeError instanceof Error ? removeError.message : "Não foi possível excluir o lead.");
    }
  }

  if (error) {
    return (
      <div className="lm-conclui-backdrop" onClick={onClose}>
        <div className="lm-conclui" onClick={(event) => event.stopPropagation()}>
          <h4>Ficha do lead</h4>
          <p className="lm-conclui-sub">{error}</p>
        </div>
      </div>
    );
  }
  if (!lead) {
    // Feedback imediato ao clique — sem isso a ficha "não abre nada" até a
    // API responder.
    return (
      <div className="lm-conclui-backdrop">
        <div className="lm-conclui">
          <p className="lm-conclui-sub" style={{ margin: 0 }}>Abrindo ficha...</p>
        </div>
      </div>
    );
  }

  return (
    <LeadModal
      lead={lead}
      stages={stages}
      authorName={authorName}
      onClose={onClose}
      onMove={(stageId) => void move(stageId)}
      onDelete={() => void remove()}
    />
  );
}
