"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { protectedStageRoles } from "@/lib/ai/prompt-defaults";
import type { PipelineStage } from "@/lib/types";

function isProtected(stage: PipelineStage) {
  return Boolean(
    stage.role && protectedStageRoles.includes(stage.role as (typeof protectedStageRoles)[number]),
  );
}

export function StageEditor({ initialStages }: { initialStages: PipelineStage[] }) {
  const router = useRouter();
  const [stages, setStages] = useState(initialStages.filter((stage) => stage.board_visible));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#64748b");
  const [newGroup, setNewGroup] = useState<"ia" | "closer">("ia");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function saveStage(id: string, patch: { name?: string; color?: string; board_group?: string }) {
    setBusyId(id);
    setNotice(null);
    try {
      const response = await fetch(`/api/stages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar a etapa.");
      setStages((current) => current.map((stage) => (stage.id === id ? body.stage : stage)));
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Erro ao salvar." });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function reorder(group: "ia" | "closer", fromIndex: number, toIndex: number) {
    const groupStages = stages.filter((stage) => stage.board_group === group);
    if (toIndex < 0 || toIndex >= groupStages.length) return;
    const reordered = [...groupStages];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setStages((current) => [
      ...current.filter((stage) => stage.board_group !== group),
      ...reordered,
    ]);
    setBusyId(moved.id);
    setNotice(null);
    try {
      const response = await fetch("/api/stages/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_ids: reordered.map((stage) => stage.id) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível reordenar.");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Erro ao reordenar." });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteStage(stage: PipelineStage) {
    const confirmed = window.confirm(
      `Excluir a etapa "${stage.name}"? Só funciona se não houver leads nela.`,
    );
    if (!confirmed) return;
    setBusyId(stage.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/stages/${stage.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível excluir a etapa.");
      setStages((current) => current.filter((item) => item.id !== stage.id));
      setNotice({ type: "ok", text: `Etapa "${stage.name}" excluída.` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Erro ao excluir." });
    } finally {
      setBusyId(null);
    }
  }

  async function createStage() {
    if (!newName.trim()) return;
    setCreating(true);
    setNotice(null);
    try {
      const response = await fetch("/api/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), color: newColor, board_group: newGroup }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível criar a etapa.");
      setStages((current) => [...current, body.stage]);
      setNewName("");
      setNewColor("#64748b");
      setNotice({ type: "ok", text: `Etapa "${body.stage.name}" criada.` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Erro ao criar." });
    } finally {
      setCreating(false);
    }
  }

  function renderGroup(group: "ia" | "closer", label: string) {
    const groupStages = stages
      .filter((stage) => stage.board_group === group)
      .sort((a, b) => a.position - b.position);
    return (
      <div className="stage-editor-group">
        <h3 className="stage-editor-group-title">{label}</h3>
        <div className="stage-editor-list">
          {groupStages.map((stage, index) => {
            const locked = isProtected(stage);
            const busy = busyId === stage.id;
            return (
              <article className="stage-editor-row" key={stage.id}>
                <div className="stage-editor-order">
                  <button
                    type="button"
                    className="icon-button studio-order"
                    aria-label={`Mover ${stage.name} para cima`}
                    disabled={index === 0 || busy}
                    onClick={() => void reorder(group, index, index - 1)}
                  >
                    <Icon name="arrow" size={14} className="arrow-up" />
                  </button>
                  <button
                    type="button"
                    className="icon-button studio-order"
                    aria-label={`Mover ${stage.name} para baixo`}
                    disabled={index === groupStages.length - 1 || busy}
                    onClick={() => void reorder(group, index, index + 1)}
                  >
                    <Icon name="arrow" size={14} className="arrow-down" />
                  </button>
                </div>
                <input
                  type="color"
                  className="stage-editor-color"
                  value={stage.color}
                  disabled={busy}
                  onChange={(event) => saveStage(stage.id, { color: event.target.value })}
                />
                <input
                  type="text"
                  className="stage-editor-name"
                  defaultValue={stage.name}
                  disabled={busy}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (value && value !== stage.name) saveStage(stage.id, { name: value });
                  }}
                />
                {locked && (
                  <span className="stage-editor-lock" title="Uma automação da IA depende desta etapa; pode renomear, mas não excluir.">
                    <Icon name="lock" size={13} /> Fixa
                  </span>
                )}
                <button
                  type="button"
                  className="icon-button lead-card-delete"
                  aria-label={`Excluir etapa ${stage.name}`}
                  disabled={locked || busy}
                  onClick={() => void deleteStage(stage)}
                >
                  <Icon name="x" size={14} />
                </button>
              </article>
            );
          })}
          {!groupStages.length && <div className="kanban-empty">Nenhuma etapa nesta seção.</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="stage-editor">
      {notice && (
        <div className={`studio-notice ${notice.type}`} role="status">
          <Icon name={notice.type === "ok" ? "check" : "x"} size={14} />
          {notice.text}
        </div>
      )}
      {renderGroup("ia", "Atendimento da IA")}
      {renderGroup("closer", "Closer (manual)")}
      <div className="stage-editor-add">
        <input
          type="color"
          className="stage-editor-color"
          value={newColor}
          onChange={(event) => setNewColor(event.target.value)}
        />
        <input
          type="text"
          placeholder="Nome da nova etapa"
          className="stage-editor-name"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <select value={newGroup} onChange={(event) => setNewGroup(event.target.value as "ia" | "closer")}>
          <option value="ia">Atendimento da IA</option>
          <option value="closer">Closer (manual)</option>
        </select>
        <button className="button button-primary" type="button" disabled={creating || !newName.trim()} onClick={createStage}>
          <Icon name="plus" size={14} />
          {creating ? "Criando…" : "Adicionar etapa"}
        </button>
      </div>
    </div>
  );
}
