"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { emptyCampaignFilters } from "@/lib/campaigns";
import { campaignTemplates } from "@/lib/template-catalog";
import type {
  CampaignAudienceLead,
  CampaignFilters,
  PipelineStage,
} from "@/lib/types";

type AudienceResponse = {
  count: number;
  leads: CampaignAudienceLead[];
  filters: CampaignFilters;
  summary: string;
};

type CampaignTemplateNames = {
  reactivation: string;
  black_november: string;
  next_month_classes: string;
};

export function CampaignCenter({
  stages,
  templateNames,
}: {
  stages: PipelineStage[];
  templateNames?: CampaignTemplateNames;
}) {
  const [mode, setMode] = useState<"ai" | "filters">("ai");
  const [instruction, setInstruction] = useState("");
  const [filters, setFilters] = useState<CampaignFilters>(emptyCampaignFilters);
  const [audience, setAudience] = useState<AudienceResponse | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [message, setMessage] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function buildAudience() {
    setLoading(true);
    setNotice(null);
    setConfirmed(false);
    const response = await fetch("/api/campaigns/audience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "ai" ? { instruction } : { filters }),
    });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) {
      setNotice({ type: "error", text: body.error || "Não foi possível montar o público." });
      return;
    }
    setAudience(body);
    setFilters(body.filters);
  }

  async function sendCampaign() {
    if (!audience) return;
    setSending(true);
    setNotice(null);
    const response = await fetch("/api/campaigns/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: campaignName,
        template_name: templateName,
        language_code: "pt_BR",
        message,
        lead_ids: audience.leads.map((lead) => lead.id),
        confirmed,
        admin_pin: adminPin,
      }),
    });
    const body = await response.json();
    setSending(false);
    if (!response.ok) {
      setNotice({ type: "error", text: body.error || "Não foi possível enviar." });
      return;
    }
    setNotice({
      type: "ok",
      text: `Campanha processada: ${body.sent} enviados e ${body.failed} com falha.`,
    });
    setConfirmed(false);
  }

  function toggleStage(stageId: string) {
    setFilters((current) => ({
      ...current,
      stage_ids: current.stage_ids.includes(stageId)
        ? current.stage_ids.filter((id) => id !== stageId)
        : [...current.stage_ids, stageId],
    }));
  }

  function chooseTemplate(key: string) {
    const selected = campaignTemplates.find((template) => template.key === key);
    if (!selected) {
      setTemplateName("");
      setMessage("");
      return;
    }
    setTemplateName(
      templateNames?.[selected.key as keyof CampaignTemplateNames] || selected.name,
    );
    setMessage(selected.message);
  }

  return (
    <div className="campaign-center">
      <section className="campaign-builder">
        <div className="campaign-mode-tabs" role="tablist" aria-label="Forma de selecionar público">
          <button type="button" className={mode === "ai" ? "active" : ""} onClick={() => setMode("ai")}>
            <Icon name="bot" size={15} /> Descrever para a IA
          </button>
          <button type="button" className={mode === "filters" ? "active" : ""} onClick={() => setMode("filters")}>
            <Icon name="settings" size={15} /> Usar filtros
          </button>
        </div>

        {mode === "ai" ? (
          <div className="campaign-ai-box">
            <label htmlFor="audience-instruction">Quem deve receber?</label>
            <textarea
              id="audience-instruction"
              placeholder="Ex.: Todos os leads de Passo Fundo que não fecharam entre janeiro e junho."
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
            />
            <div className="campaign-examples">
              <button type="button" onClick={() => setInstruction("Todos que interagiram com a IA mas não avançaram")}>Interagiu e não avançou</button>
              <button type="button" onClick={() => setInstruction("Todos que não responderam nenhuma mensagem da IA")}>Nunca respondeu</button>
              <button type="button" onClick={() => setInstruction("Leads de Passo Fundo que não fecharam entre janeiro e junho")}>Passo Fundo · jan–jun</button>
            </div>
          </div>
        ) : (
          <div className="campaign-filters">
            <div className="field">
              <label>Etapas do funil</label>
              <div className="stage-filter-grid">
                {stages.map((stage) => (
                  <label key={stage.id}>
                    <input
                      type="checkbox"
                      checked={filters.stage_ids.includes(stage.id)}
                      onChange={() => toggleStage(stage.id)}
                    />
                    <i style={{ background: stage.color }} />
                    {stage.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="campaign-city">Cidades, separadas por vírgula</label>
                <input
                  id="campaign-city"
                  placeholder="Passo Fundo, Chapecó"
                  value={filters.cities.join(", ")}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      cities: event.target.value.split(",").map((city) => city.trim()).filter(Boolean),
                    })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="campaign-from">Entrada a partir de</label>
                <input id="campaign-from" type="date" value={filters.created_from || ""} onChange={(event) => setFilters({ ...filters, created_from: event.target.value || null })} />
              </div>
              <div className="field">
                <label htmlFor="campaign-to">Entrada até</label>
                <input id="campaign-to" type="date" value={filters.created_to || ""} onChange={(event) => setFilters({ ...filters, created_to: event.target.value || null })} />
              </div>
            </div>
            <div className="campaign-checks">
              <label><input type="checkbox" checked={filters.interacted_with_ai} onChange={(event) => setFilters({ ...filters, interacted_with_ai: event.target.checked })} /> Interagiu com a IA</label>
              <label><input type="checkbox" checked={filters.did_not_advance} onChange={(event) => setFilters({ ...filters, did_not_advance: event.target.checked })} /> Não avançou no funil</label>
              <label><input type="checkbox" checked={filters.never_replied} onChange={(event) => setFilters({ ...filters, never_replied: event.target.checked })} /> Não respondeu após a IA</label>
              <label><input type="checkbox" checked={filters.exclude_won} onChange={(event) => setFilters({ ...filters, exclude_won: event.target.checked })} /> Excluir matrículas fechadas</label>
            </div>
          </div>
        )}

        <button
          className="button button-dark campaign-build-button"
          type="button"
          disabled={loading || (mode === "ai" && !instruction.trim())}
          onClick={buildAudience}
        >
          <Icon name="search" size={14} />
          {loading ? "Analisando público…" : "Encontrar leads"}
        </button>
      </section>

      <section className="campaign-audience">
        <div className="campaign-section-title">
          <div>
            <span>Prévia segura</span>
            <h2>Público do disparo</h2>
          </div>
          <strong>{audience?.count || 0}</strong>
        </div>
        {!audience ? (
          <div className="campaign-empty">
            <Icon name="user" size={24} />
            <p>Descreva ou filtre o público para conferir exatamente quem receberá.</p>
          </div>
        ) : audience.leads.length ? (
          <div className="audience-list">
            {audience.leads.slice(0, 50).map((lead) => (
              <div key={lead.id}>
                <span className="avatar">{(lead.name || lead.phone).slice(0, 2).toUpperCase()}</span>
                <div><strong>{lead.name || lead.phone}</strong><small>{lead.city || "Sem cidade"} · {lead.stage_name}</small></div>
                <em>{lead.reason}</em>
              </div>
            ))}
            {audience.count > 50 && <p className="audience-more">+ {audience.count - 50} leads no envio completo</p>}
          </div>
        ) : (
          <div className="campaign-empty"><p>Nenhum lead encontrado. Ajuste o pedido ou os filtros.</p></div>
        )}
      </section>

      {audience && audience.count > 0 && (
        <section className="campaign-send">
          <div className="campaign-section-title">
            <div><span>API oficial do WhatsApp</span><h2>Preparar mensagem</h2></div>
          </div>
          <div className="operations-callout warning">
            <Icon name="check" size={16} />
            <div><strong>Modelo aprovado obrigatório</strong><p>O texto será enviado como variável de um modelo aprovado no Gerenciador do WhatsApp.</p></div>
          </div>
          <div className="field-grid">
            <div className="field"><label htmlFor="campaign-name">Nome interno da campanha</label><input id="campaign-name" placeholder="Black November · Passo Fundo" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} /></div>
            <div className="field">
              <label htmlFor="campaign-template">Modelo oficial aprovado</label>
              <select
                id="campaign-template"
                value={
                  campaignTemplates.find((template) => templateName === (
                    templateNames?.[template.key as keyof CampaignTemplateNames] || template.name
                  ))?.key || ""
                }
                onChange={(event) => chooseTemplate(event.target.value)}
              >
                <option value="">Selecione o modelo</option>
                {campaignTemplates.map((template) => (
                  <option key={template.key} value={template.key}>{template.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field"><label htmlFor="campaign-message">Prévia do texto aprovado</label><textarea id="campaign-message" value={message} readOnly /></div>
          <div className="field campaign-pin"><label htmlFor="campaign-pin">PIN de segurança do disparo</label><input id="campaign-pin" type="password" inputMode="numeric" autoComplete="off" placeholder="PIN administrativo" value={adminPin} onChange={(event) => setAdminPin(event.target.value)} /></div>
          <label className="campaign-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Conferi o público de {audience.count} leads e autorizo este disparo oficial.</label>
          <button className="button button-primary" type="button" disabled={!confirmed || !adminPin || sending} onClick={sendCampaign}><Icon name="send" size={14} />{sending ? "Enviando…" : `Enviar para ${audience.count} leads`}</button>
        </section>
      )}

      {notice && <div className={`studio-notice campaign-notice ${notice.type}`} role="status">{notice.text}</div>}
    </div>
  );
}
