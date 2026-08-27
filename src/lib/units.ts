// Filtro por unidade. O interesse do lead fica em leads.unit_interest como
// texto livre preenchido pela IA ("Chapecó", "Online"...).
// SISTEMA EXCLUSIVO DE CHAPECÓ (decisão do diretor, 07/08/2026):
// - Chapecó (closer): vê Chapecó + Online + leads sem unidade — tudo que é
//   da operação. Só ficam de fora leads legados marcados como Passo Fundo.
// - Passo Fundo (legado): regra antiga mantida caso o usuário ainda exista.
// - Admin e SDR veem tudo.

import type { SessionUser } from "@/lib/auth";

export const UNIT_LABELS: Record<string, string> = {
  chapeco: "Chapecó",
  passo_fundo: "Passo Fundo",
};

export function unitVisibleTo(unitInterest: string | null | undefined, unit: SessionUser["unit"]) {
  if (!unit) return true;
  const value = (unitInterest || "").toLowerCase();
  if (unit === "chapeco") return !value.includes("passo");
  return !value || value.includes("passo") || value.includes("online");
}

// Expressão para .or() do PostgREST com a mesma regra do unitVisibleTo.
export function unitOrExpression(unit: "chapeco" | "passo_fundo", column = "unit_interest") {
  if (unit === "chapeco") {
    // Tudo, exceto legado de Passo Fundo.
    return [
      `${column}.not.ilike.%passo%`,
      `${column}.is.null`,
      `${column}.eq.`,
    ].join(",");
  }
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
