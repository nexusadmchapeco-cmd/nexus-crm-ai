"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";

export function ChatActions({ leadId, humanTakeover }: { leadId: string; humanTakeover: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function action(path: string) {
    setLoading(true);
    const response = await fetch(path, { method: "POST" });
    setLoading(false);
    if (!response.ok) alert((await response.json()).error || "Não foi possível concluir a ação");
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
    </div>
  );
}
