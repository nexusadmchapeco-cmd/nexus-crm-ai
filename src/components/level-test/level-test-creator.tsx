"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LeadOption = { id: string; name: string | null; phone: string };

export function LevelTestCreator({ leads }: { leads: LeadOption[] }) {
  const router = useRouter();
  const [leadId, setLeadId] = useState("");
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setCreating(true);
    setError(null);
    setLink(null);
    setCopied(false);
    try {
      const response = await fetch("/api/level-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível gerar o link.");
      setLink(data.url);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro ao gerar o link.");
    } finally {
      setCreating(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Não consegui copiar automaticamente — selecione o link e copie manualmente.");
    }
  }

  return (
    <div className="level-test-creator">
      <div className="level-test-creator-row">
        <select value={leadId} onChange={(event) => setLeadId(event.target.value)}>
          <option value="">Aluno avulso (sem vincular a lead)</option>
          {leads.map((lead) => (
            <option key={lead.id} value={lead.id}>
              {lead.name || lead.phone}
            </option>
          ))}
        </select>
        <button className="button button-primary" disabled={creating} onClick={() => void generate()}>
          {creating ? "Gerando…" : "Gerar link de teste"}
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {link && (
        <div className="level-test-link">
          <a href={link} target="_blank" rel="noreferrer">{link}</a>
          <button className="button" onClick={() => void copy()}>{copied ? "Copiado ✓" : "Copiar"}</button>
        </div>
      )}
    </div>
  );
}
