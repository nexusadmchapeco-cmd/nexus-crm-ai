"use client";

import { useEffect, useState } from "react";
import {
  PROSPECT_STATUS_LABELS,
  toWaMeNumber,
  type ProspectResult,
  type ProspectStatus,
} from "@/lib/prospects";

const SUGGESTIONS = [
  "academias",
  "clínicas",
  "escritórios de contabilidade",
  "imobiliárias",
  "restaurantes",
  "hotéis",
  "indústrias",
];
const STATUSES: ProspectStatus[] = [
  "novo",
  "contatado",
  "respondeu",
  "reuniao",
  "fechado",
  "descartado",
];

export default function ProspeccaoPage() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [results, setResults] = useState<ProspectResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/prospects/message")
      .then((response) => response.json())
      .then((data) => setTemplate(data.message || ""))
      .catch(() => {});
  }, []);

  async function search() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/prospects/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, city }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro na busca.");
      setResults(data.results || []);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Erro na busca.");
    } finally {
      setLoading(false);
    }
  }

  function messageFor(item: ProspectResult) {
    return template.replaceAll("[cidade]", city || "sua região").replaceAll("[empresa]", item.name);
  }

  async function copyMessage(item: ProspectResult) {
    try {
      await navigator.clipboard.writeText(messageFor(item));
      setCopiedId(item.place_id);
      setTimeout(() => setCopiedId((current) => (current === item.place_id ? null : current)), 1800);
    } catch {
      setError("Não consegui copiar; copie manualmente.");
    }
  }

  async function setStatus(item: ProspectResult, status: ProspectStatus) {
    setResults((current) =>
      current.map((row) => (row.place_id === item.place_id ? { ...row, status } : row)),
    );
    await fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place_id: item.place_id, status }),
    }).catch(() => {});
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <div className="eyebrow">Operação</div>
          <h1>Prospecção de parceiros</h1>
          <p>
            Busque empresas por tipo e cidade para oferecer convênio. A mensagem é enviada
            manualmente, do seu WhatsApp — nunca pela API.
          </p>
        </div>
      </div>

      <div className="prospect-search">
        <input
          placeholder="Tipo de negócio (ex.: academias)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          list="prospect-suggestions"
        />
        <datalist id="prospect-suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
        <input placeholder="Cidade" value={city} onChange={(event) => setCity(event.target.value)} />
        <button type="button" disabled={loading || !query.trim()} onClick={() => void search()}>
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>
      <div className="prospect-chips">
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => setQuery(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>

      {error && <div className="prospect-error">{error}</div>}

      <div className="prospect-list">
        {results.map((item) => (
          <div key={item.place_id} className="prospect-card">
            <div className="prospect-card-main">
              <div className="prospect-card-title">
                <strong>{item.name}</strong>
                {item.probably_whatsapp && <span className="prospect-wa">provável WhatsApp</span>}
                <span className={`prospect-status status-${item.status}`}>
                  {PROSPECT_STATUS_LABELS[item.status]}
                </span>
              </div>
              {item.address && <span className="prospect-addr">{item.address}</span>}
              <span className="prospect-meta">
                {item.phone || "sem telefone"}
                {item.rating != null ? ` · ⭐ ${item.rating}` : ""}
                {item.website ? (
                  <>
                    {" · "}
                    <a href={item.website} target="_blank" rel="noreferrer">site</a>
                  </>
                ) : null}
              </span>
            </div>
            <div className="prospect-card-actions">
              <button type="button" onClick={() => void copyMessage(item)}>
                {copiedId === item.place_id ? "Copiado!" : "Copiar mensagem"}
              </button>
              {item.phone && (
                <a
                  className="prospect-wa-link"
                  href={`https://wa.me/${toWaMeNumber(item.phone)}?text=${encodeURIComponent(messageFor(item))}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => void setStatus(item, "contatado")}
                >
                  Abrir WhatsApp
                </a>
              )}
              <select
                value={item.status}
                onChange={(event) => void setStatus(item, event.target.value as ProspectStatus)}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{PROSPECT_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {!loading && results.length === 0 && (
          <p className="prospect-empty">Faça uma busca para ver empresas.</p>
        )}
      </div>
    </div>
  );
}
