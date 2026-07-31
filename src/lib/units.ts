// Filtro por unidade. O interesse do lead fica em leads.unit_interest como
// texto livre preenchido pela IA ("Chapecó", "Passo Fundo", "Online"...).
// Regra combinada com o Guilherme (31/07/2026):
// - Chapecó (Jaziel): vê EXCLUSIVAMENTE leads de Chapecó.
// - Passo Fundo (Lucas): vê Passo Fundo + Online + leads ainda sem unidade
//   (Online pertence ao Lucas; sem unidade fica com ele para nada sumir).
// - Admin e SDR veem tudo.

import type { SessionUser } from "@/lib/auth";

export const UNIT_LABELS: Record<string, string> = {
  chapeco: "Chapecó",
  passo_fundo: "Passo Fundo",
};

export function unitVisibleTo(unitInterest: string | null | undefined, unit: SessionUser["unit"]) {
  if (!unit) return true;
  const value = (unitInterest || "").toLowerCase();
  if (unit === "chapeco") return value.includes("chapec");
  return !value || value.includes("passo") || value.includes("online");
}

// Expressão para .or() do PostgREST com a mesma regra do unitVisibleTo.
export function unitOrExpression(unit: "chapeco" | "passo_fundo", column = "unit_interest") {
  if (unit === "chapeco") return `${column}.ilike.%chapec%`;
  return [
    `${column}.ilike.%passo%`,
    `${column}.ilike.%online%`,
    `${column}.is.null`,
    `${column}.eq.`,
  ].join(",");
}

// Sessões de vendedor enxergam só a própria unidade; admin e SDR veem tudo.
export function scopedUnit(user: SessionUser | null): "chapeco" | "passo_fundo" | null {
  return user?.role === "vendedor" && user.unit ? user.unit : null;
}
