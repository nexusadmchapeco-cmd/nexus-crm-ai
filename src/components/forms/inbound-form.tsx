"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";

type Result = {
  lead: { id: string; name: string | null; phone: string; temperature: string };
  ai_reply: string | null;
  stage: { name: string };
  skipped_ai: boolean;
};

export function InboundForm({ configured }: { configured: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(""); setResult(null);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/messages/inbound", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
    });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) return setError(body.error || "Não foi possível processar a mensagem.");
    setResult(body);
  }

  return (
    <form className="form-card" onSubmit={submit}>
      <div className="form-card-head"><h2>Mensagem recebida</h2><p>Simule exatamente o payload que chegará pelo WhatsApp.</p></div>
      <div className="form-body">
        {!configured && <div className="error-banner">Configure o Supabase e a OpenAI no .env.local antes de executar o teste.</div>}
        {error && <div className="error-banner">{error}</div>}
        <div className="field-grid">
          <div className="field"><label htmlFor="phone">Telefone *</label><input id="phone" name="phone" required defaultValue="554999999999" inputMode="tel" /></div>
          <div className="field"><label htmlFor="name">Nome (opcional)</label><input id="name" name="name" placeholder="Ex.: Mariana" /></div>
        </div>
        <div className="field"><label htmlFor="message">Mensagem *</label><textarea id="message" name="message" required defaultValue="Oi, queria saber sobre inglês presencial em Passo Fundo. Quero começar porque vou viajar." /></div>
        <div className="field-grid">
          <div className="field"><label htmlFor="source">Origem</label><select id="source" name="source" defaultValue="meta_ads"><option value="meta_ads">Meta Ads</option><option value="organico">Orgânico</option><option value="indicacao">Indicação</option><option value="simulador">Simulador</option></select></div>
          <div className="field"><label htmlFor="campaign">Campanha</label><input id="campaign" name="campaign" placeholder="Ex.: Inglês para viagem" /></div>
        </div>
        {result && (
          <div className="result-card">
            <h3><Icon name="check" size={13} /> Mensagem processada com sucesso</h3>
            <div className="result-grid">
              <div className="result-item"><span>Etapa atual</span><strong>{result.stage.name}</strong></div>
              <div className="result-item"><span>Temperatura</span><strong>{result.lead.temperature.replaceAll("_", " ")}</strong></div>
              <div className="result-reply"><b>{result.skipped_ai ? "IA pausada:" : "Resposta da IA:"}</b> {result.ai_reply || "O humano assumiu esta conversa; nenhuma resposta automática foi enviada."}</div>
              <Link href={`/conversations?lead=${result.lead.id}`} className="button">Abrir conversa <Icon name="arrow" size={13} /></Link>
            </div>
          </div>
        )}
      </div>
      <div className="form-footer"><button className="button button-primary" disabled={loading || !configured} type="submit"><Icon name="send" size={14} />{loading ? "Processando com IA…" : "Enviar mensagem simulada"}</button></div>
    </form>
  );
}
