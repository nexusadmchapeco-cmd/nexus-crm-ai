"use client";

import { useCallback, useEffect, useState } from "react";
import { getStoredSeller, type StoredSeller } from "@/lib/seller";

type MetricValue = { target: number; realized: number };
type PeriodMetrics = Record<string, MetricValue>;
type VendedorData = {
  metrics: Record<string, PeriodMetrics>;
  ranking: { name: string; contatos: number }[];
};

const PERIOD_LABELS: Record<string, string> = { dia: "Hoje", semana: "Esta semana", mes: "Este mês" };
const METRIC_LABELS: Record<string, string> = {
  contatos: "Contatos",
  agendamentos: "Agendamentos",
  matriculas: "Matrículas",
  receita: "Receita",
};
const METRICS = ["contatos", "agendamentos", "matriculas", "receita"];

export default function VendedorPage() {
  const [seller, setSeller] = useState<StoredSeller | null>(null);
  const [data, setData] = useState<VendedorData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Formulário de metas.
  const [goalPeriod, setGoalPeriod] = useState("mes");
  const [goalMetric, setGoalMetric] = useState("contatos");
  const [goalTarget, setGoalTarget] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);

  // Novo vendedor.
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("closer");
  const [savingSeller, setSavingSeller] = useState(false);

  const load = useCallback(async (current: StoredSeller | null) => {
    if (!current) {
      setData(null);
      return;
    }
    try {
      const response = await fetch(
        `/api/vendedor?seller_id=${current.id}&name=${encodeURIComponent(current.name)}`,
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Erro ao carregar.");
      setData(payload);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar.");
    }
  }, []);

  useEffect(() => {
    const current = getStoredSeller();
    setSeller(current);
    void load(current);
    const handler = () => {
      const next = getStoredSeller();
      setSeller(next);
      void load(next);
    };
    window.addEventListener("seller-changed", handler);
    return () => window.removeEventListener("seller-changed", handler);
  }, [load]);

  async function saveGoal() {
    if (!seller || !goalTarget || savingGoal) return;
    setSavingGoal(true);
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller_id: seller.id,
          period: goalPeriod,
          metric: goalMetric,
          target: Number(goalTarget),
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Erro ao salvar meta.");
      setGoalTarget("");
      await load(seller);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro ao salvar meta.");
    } finally {
      setSavingGoal(false);
    }
  }

  async function addSeller() {
    if (!newName.trim() || savingSeller) return;
    setSavingSeller(true);
    try {
      const response = await fetch("/api/sellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, role: newRole }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Erro ao criar.");
      setNewName("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Erro ao criar.");
    } finally {
      setSavingSeller(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <div className="eyebrow">Operação</div>
          <h1>Vendedor</h1>
          <p>{seller ? `Metas e desempenho de ${seller.name}.` : "Selecione um vendedor no topo."}</p>
        </div>
      </div>

      {error && <div className="vendedor-error">{error}</div>}

      {!seller ? (
        <div className="vendedor-empty">
          Escolha um vendedor no seletor do topo para ver as metas. Se ainda não há
          nenhum, cadastre abaixo.
        </div>
      ) : (
        data && (
          <div className="vendedor-periods">
            {(["dia", "semana", "mes"] as const).map((period) => (
              <section key={period} className="vendedor-card">
                <h3>{PERIOD_LABELS[period]}</h3>
                {METRICS.map((metric) => {
                  const value = data.metrics[period]?.[metric] || { target: 0, realized: 0 };
                  const pct = value.target > 0 ? Math.min(100, Math.round((value.realized / value.target) * 100)) : 0;
                  return (
                    <div key={metric} className="vendedor-metric">
                      <div className="vendedor-metric-head">
                        <span>{METRIC_LABELS[metric]}</span>
                        <strong>
                          {value.realized}
                          {value.target > 0 ? ` / ${value.target}` : ""}
                        </strong>
                      </div>
                      <div className="vendedor-bar">
                        <i style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        )
      )}

      {data && data.ranking.length > 0 && (
        <section className="vendedor-ranking">
          <h3>Ranking do mês · contatos</h3>
          <ol>
            {data.ranking.map((row) => (
              <li key={row.name}>
                <span>{row.name}</span>
                <strong>{row.contatos}</strong>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="vendedor-config">
        <section className="vendedor-form">
          <h3>Definir meta</h3>
          <p>Para o vendedor selecionado no topo.</p>
          <div className="vendedor-form-row">
            <select value={goalPeriod} onChange={(event) => setGoalPeriod(event.target.value)}>
              <option value="dia">Dia</option>
              <option value="semana">Semana</option>
              <option value="mes">Mês</option>
            </select>
            <select value={goalMetric} onChange={(event) => setGoalMetric(event.target.value)}>
              {METRICS.map((metric) => (
                <option key={metric} value={metric}>{METRIC_LABELS[metric]}</option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              placeholder="Alvo"
              value={goalTarget}
              onChange={(event) => setGoalTarget(event.target.value)}
            />
            <button type="button" disabled={!seller || !goalTarget || savingGoal} onClick={() => void saveGoal()}>
              Salvar
            </button>
          </div>
        </section>

        <section className="vendedor-form">
          <h3>Cadastrar vendedor</h3>
          <p>Provisório, sem login — só organização.</p>
          <div className="vendedor-form-row">
            <input placeholder="Nome" value={newName} onChange={(event) => setNewName(event.target.value)} />
            <select value={newRole} onChange={(event) => setNewRole(event.target.value)}>
              <option value="sdr">SDR</option>
              <option value="closer">Closer</option>
              <option value="gestor">Gestor</option>
            </select>
            <button type="button" disabled={!newName.trim() || savingSeller} onClick={() => void addSeller()}>
              Cadastrar
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
