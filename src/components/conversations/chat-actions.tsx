"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";

export function ChatActions({
  leadId,
  humanTakeover,
  leadLabel,
}: {
  leadId: string;
  humanTakeover: boolean;
  leadLabel: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function action(path: string) {
    setLoading(true);
    const response = await fetch(path, { method: "POST" });
    setLoading(false);
    if (!response.ok) alert((await response.json()).error || "Não foi possível concluir a ação");
    router.refresh();
  }

  async function deleteLead() {
    const confirmed = window.confirm(
      `Excluir o lead ${leadLabel}? Isso apaga a conversa e o histórico. Não pode ser desfeito.`,
    );
    if (!confirmed) return;
    setLoading(true);
    const response = await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
    if (!response.ok) {
      setLoading(false);
      alert((await response.json()).error || "Não foi possível excluir o lead.");
      return;
    }
    router.push("/conversations");
    router.refresh();
  }

  return (
    <div className="lead-actions">
      {humanTakeover ? (
        <button disabled={loading} className="button button-primary primary-action" onClick={() => action(`/api/leads/${leadId}/return-to-ai`)}>
          <Icon name="bot" size={14} /> Devolver para IA
        </button>
      ) : (
        <button disabled={loading} className="button button-dark primary-action" onClick={() => action(`/api/leads/${leadId}/takeover`)}>
          <Icon name="user" size={14} /> Assumir conversa
        </button>
      )}
      <button disabled={loading} className="button" onClick={() => action(`/api/leads/${leadId}/status?value=won`)}>Matrícula</button>
      <button disabled={loading} className="button button-danger" onClick={() => action(`/api/leads/${leadId}/status?value=lost`)}>Perdido</button>
      <button disabled={loading} className="button button-danger primary-action" onClick={deleteLead}>
        <Icon name="x" size={14} /> Excluir lead
      </button>
    </div>
  );
}
