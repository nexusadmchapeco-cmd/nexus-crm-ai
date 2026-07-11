"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { protectedStageNames } from "@/lib/ai/prompt-defaults";
import type { PipelineStage } from "@/lib/types";

export function StageEditor({ initialStages }: { initialStages: PipelineStage[] }) {
  const router = useRouter();
  const [stages, setStages] = useState(initialStages);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#64748b");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  function isProtected(name: string) {
    return protectedStageNames.includes(name as (typeof protectedStageNames)[number]);
  }

  async function saveStage(id: string, patch: { name?: string; color?: string }) {
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

  async function reorder(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= stages.length) return;
    const next = [...stages];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setStages(next);
    setBusyId(moved.id);
    setNotice(null);
    try {
      const response = await fetch("/api/stages/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_ids: next.map((stage) => stage.id) }),
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
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
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

  return (
    <div className="stage-editor">
      {notice && (
        <div className={`studio-notice ${notice.type}`} role="status">
          <Icon name={notice.type === "ok" ? "check" : "x"} size={14} />
          {notice.text}
        </div>
      )}
      <div className="stage-editor-list">
        {stages.map((stage, index) => {
          const locked = isProtected(stage.name);
          const busy = busyId === stage.id;
          return (
            <article className="stage-editor-row" key={stage.id}>
              <div className="stage-editor-order">
                <button
                  type="button"
                  className="icon-button studio-order"
                  aria-label={`Mover ${stage.name} para cima`}
                  disabled={index === 0 || busy}
                  onClick={() => void reorder(index, index - 1)}
                >
                  <Icon name="arrow" size={14} className="arrow-up" />
                </button>
                <button
                  type="button"
                  className="icon-button studio-order"
                  aria-label={`Mover ${stage.name} para baixo`}
                  disabled={index === stages.length - 1 || busy}
                  onClick={() => void reorder(index, index + 1)}
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
                disabled={locked || busy}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value && value !== stage.name) saveStage(stage.id, { name: value });
                }}
              />
              {locked && (
                <span className="stage-editor-lock" title="Usada pela automação da IA, não pode ser renomeada ou excluída.">
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
      </div>
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
        <button className="button button-primary" type="button" disabled={creating || !newName.trim()} onClick={createStage}>
          <Icon name="plus" size={14} />
          {creating ? "Criando…" : "Adicionar etapa"}
        </button>
      </div>
    </div>
  );
}
