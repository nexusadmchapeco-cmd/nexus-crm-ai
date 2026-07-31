// Filtro por unidade (Chapecó / Passo Fundo). O interesse do lead fica em
// leads.unit_interest como texto livre preenchido pela IA ("Chapecó",
// "Passo Fundo", "Online"...). Leads Online ou ainda sem unidade aparecem
// para as duas unidades — melhor duplicar visão do que esconder lead.

import type { SessionUser } from "@/lib/auth";

export const UNIT_LABELS: Record<string, string> = {
  chapeco: "Chapecó",
  passo_fundo: "Passo Fundo",
};

export function unitVisibleTo(unitInterest: string | null | undefined, unit: SessionUser["unit"]) {
  if (!unit) return true;
  const value = (unitInterest || "").toLowerCase();
  if (!value || value.includes("online")) return true;
  return unit === "chapeco" ? value.includes("chapec") : value.includes("passo");
}

// Expressão para .or() do PostgREST com a mesma regra do unitVisibleTo.
export function unitOrExpression(unit: "chapeco" | "passo_fundo", column = "unit_interest") {
  const pattern = unit === "chapeco" ? "%chapec%" : "%passo%";
  return [
    `${column}.ilike.${pattern}`,
    `${column}.ilike.%online%`,
    `${column}.is.null`,
    `${column}.eq.`,
  ].join(",");
}

// Sessões de vendedor enxergam só a própria unidade; admin e SDR veem tudo.
export function scopedUnit(user: SessionUser | null): "chapeco" | "passo_fundo" | null {
  return user?.role === "vendedor" && user.unit ? user.unit : null;
}
