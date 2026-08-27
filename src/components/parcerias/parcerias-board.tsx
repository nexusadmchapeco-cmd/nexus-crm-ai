"use client";

// Parcerias com Empresas — módulo PRÓPRIO, separado do Kanban de leads
// (pedido do diretor). Tudo manual, no WhatsApp DO VENDEDOR: a busca monta a
// lista com filtros, a IA só escreve a abordagem (abre no WhatsApp Web /
// app), ligação pelo tel: e o vendedor aponta o status na mão no funil.

import { useCallback, useEffect, useMemo, useState } from "react";

type PlaceResult = {
  place_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  probably_whatsapp: boolean;
  status: string;
};

type Prospect = {
  id: string;
  place_id: string;
  company_name: string | null;
  segment: string | null;
  city: string | null;
  status: string;
  note: string | null;
  contacted_at: string | null;
  created_at: string;
};

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: "novo", label: "Mapeada", color: "#3d8bfd" },
  { value: "contatado", label: "Contato feito", color: "#14b8a6" },
  { value: "respondeu", label: "Respondeu", color: "#0ea5e9" },
  { value: "reuniao", label: "Reunião", color: "#8b5cf6" },
  { value: "negociacao", label: "Negociação", color: "#f5a623" },
  { value: "fechado", label: "Parceria ativa", color: "#22a06b" },
  { value: "descartado", label: "Descartada", color: "#94a3b8" },
];

function statusOf(value: string) {
  return STATUS_OPTIONS.find((option) => option.value === value) || STATUS_OPTIONS[0];
}

export function ParceriasBoard() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Busca no Google Places
  const [segmento, setSegmento] = useState("");
  const [cidade, setCidade] = useState("Chapecó, SC");
  const [soComTelefone, setSoComTelefone] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<PlaceResult[]>([]);

  // Filtros do funil
  const [filtroStatus, setFiltroStatus] = useState("todas");
  const [filtroNome, setFiltroNome] = useState("");

  // Modal de abordagem (mensagem pronta pro WhatsApp do vendedor)
  const [waModal, setWaModal] = useState<{
    phone: string;
    name: string;
    place_id: string | null;
    message: string;
    loading: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/prospects");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Erro ao carregar parcerias.");
      setProspects(payload.prospects || []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar parcerias.");
    }
  }, []);

  useEffect(() => {
    void load();
    // Cidade padrão pela unidade do usuário logado.
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data) => {
        if (data.user?.unit === "chapeco") setCidade("Chapecó, SC");
      })
      .catch(() => {});
  }, [load]);

  async function buscar() {
    if (!segmento.trim() || buscando) return;
    setBuscando(true);
    setNotice(null);
    try {
      const response = await fetch("/api/prospects/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: segmento.trim(), city: cidade }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Erro na busca.");
      setResultados(payload.results || []);
      setError(null);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Erro na busca.");
    } finally {
      setBuscando(false);
    }
  }

  async function salvar(place: PlaceResult, status = "novo") {
    const response = await fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        place_id: place.place_id,
        status,
        company_name: place.name,
        segment: segmento.trim() || null,
        city: cidade,
      }),
    });
    if (response.ok) {
      setResultados((current) =>
        current.map((item) => (item.place_id === place.place_id ? { ...item, status } : item)),
      );
      await load();
    }
  }

  async function mudarStatus(prospect: Prospect, status: string) {
    setProspects((current) =>
      current.map((item) => (item.id === prospect.id ? { ...item, status } : item)),
    );
    const response = await fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        place_id: prospect.place_id,
        status,
        company_name: prospect.company_name,
        segment: prospect.segment,
        city: prospect.city,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setNotice(payload.error || "Erro ao atualizar o status.");
      await load();
    }
  }

  // Abre o modal com a abordagem escrita pela IA; o envio é humano, do
  // WhatsApp do próprio vendedor (WhatsApp Web no computador).
  async function abrirAbordagem(name: string, phone: string, placeId: string | null) {
    setWaModal({ phone, name, place_id: placeId, message: "", loading: true });
    try {
      const response = await fetch("/api/prospects/ai-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, segment: segmento.trim(), city: cidade }),
      });
      const payload = await response.json();
      setWaModal((current) =>
        current ? { ...current, message: payload.message || "", loading: false } : current,
      );
    } catch {
      setWaModal((current) => (current ? { ...current, loading: false } : current));
    }
  }

  const resultadosVisiveis = soComTelefone
    ? resultados.filter((place) => place.phone)
    : resultados;

  const funil = useMemo(() => {
    const nome = filtroNome.trim().toLowerCase();
    return prospects
      .filter((prospect) => filtroStatus === "todas" || prospect.status === filtroStatus)
      .filter(
        (prospect) => !nome || (prospect.company_name || "").toLowerCase().includes(nome),
      );
  }, [prospects, filtroStatus, filtroNome]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const prospect of prospects) map[prospect.status] = (map[prospect.status] || 0) + 1;
    return map;
  }, [prospects]);

  const total = prospects.length;
  const contatadas = total - (counts.novo || 0) - (counts.descartado || 0);
  const resultado =
    (counts.respondeu || 0) + (counts.reuniao || 0) + (counts.negociacao || 0) + (counts.fechado || 0);
  const taxa = contatadas > 0 ? Math.round((resultado / contatadas) * 100) : 0;

  return (
    <div className="pv-shell">
      {error && <div className="vendedor-error">{error}</div>}
      {notice && <div className="studio-notice warning">{notice}</div>}

      <div className="pv-stats">
        <div className="pv-stat b-blue"><h5>Prospectadas</h5><div className="v">{total}</div><span>Empresas no funil</span></div>
        <div className="pv-stat b-yellow"><h5>Contatadas</h5><div className="v">{contatadas}</div><span>Abordagem feita</span></div>
        <div className="pv-stat b-purple"><h5>Deram resultado</h5><div className="v">{resultado}</div><span>{taxa}% das contatadas</span></div>
        <div className="pv-stat b-green"><h5>Parcerias ativas</h5><div className="v">{counts.fechado || 0}</div><span>Gerando indicações</span></div>
      </div>

      <div className="pv-card pv-mt">
        <div className="pv-card-h"><h3>Buscar empresas</h3><span className="pv-gtag"><i className="pv-gdot" /> Google Places</span></div>
        <div className="pv-search">
          <input
            placeholder="Segmento (academias, escritórios, clínicas...)"
            value={segmento}
            onChange={(event) => setSegmento(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void buscar()}
          />
          <select value={cidade} onChange={(event) => setCidade(event.target.value)}>
            <option>Chapecó, SC</option>
            <option>Passo Fundo, RS</option>
          </select>
          <button type="button" className="pv-btn" onClick={() => void buscar()} disabled={buscando || !segmento.trim()}>
            {buscando ? "Buscando..." : "Buscar"}
          </button>
        </div>
        <label className="parcerias-filtro-tel">
          <input
            type="checkbox"
            checked={soComTelefone}
            onChange={(event) => setSoComTelefone(event.target.checked)}
          />
          Mostrar só empresas com telefone
        </label>
        {resultadosVisiveis.map((place) => (
          <div className="pv-emp" key={place.place_id}>
            <div>
              <div className="nm">{place.name}</div>
              <div className="dt">
                {[place.address, place.rating ? `★ ${place.rating}` : null, place.phone].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="acts">
              {place.phone && (
                <button type="button" className="pv-btn-green pv-btn-sm" onClick={() => void abrirAbordagem(place.name, place.phone!, place.place_id)}>
                  WhatsApp
                </button>
              )}
              {place.phone && (
                <a className="pv-btn-ghost pv-btn-sm" href={`tel:${place.phone.replace(/\D/g, "")}`}>Ligar</a>
              )}
              <button
                type="button"
                className="pv-btn-ghost pv-btn-sm"
                disabled={place.status !== "novo" && Boolean(place.status)}
                onClick={() => void salvar(place)}
              >
                {place.status && place.status !== "novo" ? "No funil ✓" : "+ Funil"}
              </button>
            </div>
          </div>
        ))}
        {resultados.length > 0 && resultadosVisiveis.length === 0 && (
          <p className="dia-empty">Todos os resultados estão sem telefone — desmarque o filtro pra ver.</p>
        )}
      </div>

      <div className="pv-card pv-mt">
        <div className="pv-card-h"><h3>Funil de parcerias</h3></div>
        <div className="parcerias-filtros">
          <button
            type="button"
            className={filtroStatus === "todas" ? "on" : ""}
            onClick={() => setFiltroStatus("todas")}
          >
            Todas ({total})
          </button>
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={filtroStatus === option.value ? "on" : ""}
              style={{ "--st-color": option.color } as React.CSSProperties}
              onClick={() => setFiltroStatus(option.value)}
            >
              {option.label} ({counts[option.value] || 0})
            </button>
          ))}
          <input
            placeholder="Filtrar por nome..."
            value={filtroNome}
            onChange={(event) => setFiltroNome(event.target.value)}
          />
        </div>
        {funil.length === 0 && <p className="dia-empty">Nenhuma empresa aqui — use a busca acima pra mapear.</p>}
        {funil.map((prospect) => (
          <div className="pv-emp" key={prospect.id}>
            <div>
              <div className="nm">{prospect.company_name || "Empresa"}</div>
              <div className="dt">{[prospect.segment, prospect.city].filter(Boolean).join(" · ") || "—"}</div>
            </div>
            <div className="acts">
              <span className="parcerias-status-dot" style={{ background: statusOf(prospect.status).color }} />
              <select
                className="parcerias-status"
                value={prospect.status}
                onChange={(event) => void mudarStatus(prospect, event.target.value)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      {waModal && (
        <div className="dia-modal-backdrop" onClick={() => setWaModal(null)}>
          <div className="dia-modal" onClick={(event) => event.stopPropagation()}>
            <div className="dia-modal-head">
              <h4>Abordagem — {waModal.name}</h4>
              <button type="button" onClick={() => setWaModal(null)} aria-label="Fechar">✕</button>
            </div>
            {waModal.loading ? (
              <p className="dia-empty">A IA está escrevendo a abordagem...</p>
            ) : (
              <>
                <textarea
                  className="pv-blockers"
                  value={waModal.message}
                  onChange={(event) => setWaModal({ ...waModal, message: event.target.value })}
                />
                <p className="field-hint" style={{ margin: "6px 0 10px" }}>
                  Abre no SEU WhatsApp (Web ou celular) — revise e envie você mesmo.
                </p>
                <a
                  className="dia-modal-save"
                  style={{ textAlign: "center", textDecoration: "none" }}
                  href={`https://wa.me/${waModal.phone.replace(/\D/g, "").replace(/^(?!55)/, "55")}?text=${encodeURIComponent(waModal.message)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    if (waModal.place_id) {
                      const place = resultados.find((item) => item.place_id === waModal.place_id);
                      if (place) void salvar(place, "contatado");
                    }
                  }}
                >
                  Abrir no meu WhatsApp e marcar contato feito
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
