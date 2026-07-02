"use client";

import { FormEvent, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { AiSettings } from "@/lib/types";

export function AiSettingsForm({ settings }: { settings: AiSettings }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setSaved(false); setError("");
    const response = await fetch("/api/settings/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
    });
    setSaving(false);
    if (!response.ok) return setError((await response.json()).error || "Erro ao salvar.");
    setSaved(true);
  }

  return (
    <form className="form-card" onSubmit={submit}>
      <div className="form-card-head"><h2>Comportamento da assistente</h2><p>Estas instruções são usadas em toda nova resposta automática.</p></div>
      <div className="form-body">
        {error && <div className="error-banner">{error}</div>}
        <div className="field-grid">
          <div className="field"><label htmlFor="name">Nome da IA</label><input id="name" name="name" defaultValue={settings.name} required /></div>
          <div className="field"><label htmlFor="model">Modelo</label><input id="model" name="model" defaultValue={settings.model} required /></div>
        </div>
        <div className="field"><label htmlFor="temperature">Temperatura da geração (0 a 1)</label><input id="temperature" name="temperature" type="number" min="0" max="1" step="0.1" defaultValue={settings.temperature} required /></div>
        <div className="field"><label htmlFor="global_prompt">Prompt principal</label><textarea className="prompt" id="global_prompt" name="global_prompt" defaultValue={settings.global_prompt} required /></div>
      </div>
      <div className="form-footer">
        {saved && <span className="success-toast">Alterações salvas no Supabase.</span>}
        <button disabled={saving} className="button button-primary" type="submit"><Icon name="check" size={14} />{saving ? "Salvando…" : "Salvar configurações"}</button>
      </div>
    </form>
  );
}
