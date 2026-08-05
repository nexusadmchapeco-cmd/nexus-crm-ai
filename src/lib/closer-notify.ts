// Notificação de lead quente para o closer (briefing seção 2). Um único
// construtor usado pelo handoff automático da IA e pelo botão "Enviar pro
// vendedor". O formato depende do modelo configurado no Estúdio:
// - "lead_quente" (novo): 7 variáveis em linhas separadas, com o telefone do
//   lead e a modalidade.
// - "resumo_closer" (antigo): 5 variáveis em linha única (fallback até o
//   modelo novo ser aprovado na Meta).

import { closerPhoneForLead } from "@/lib/operations";
import type { OperationsSettings } from "@/lib/types";

type LeadLike = {
  name: string | null;
  phone: string;
  objective: string | null;
  unit_interest: string | null;
  city: string | null;
  availability: string | null;
  summary: string | null;
};

// Variáveis de modelo da Meta não aceitam quebra de linha nem 4+ espaços.
function sanitizeParam(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 300) || "-";
}

// Ex.: "5549999990000" → "+55 49 99999-0000" (fica legível e copiável;
// o link wa.me continua usando só os dígitos).
export function formatPhoneDisplay(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const national = digits.startsWith("55") ? digits.slice(2) : digits;
  if (national.length < 10) return phone;
  const ddd = national.slice(0, 2);
  const rest = national.slice(2);
  const split = rest.length > 4 ? rest.length - 4 : rest.length;
  return `+55 ${ddd} ${rest.slice(0, split)}-${rest.slice(split)}`;
}

export function leadModalidade(lead: Pick<LeadLike, "unit_interest">) {
  const value = (lead.unit_interest || "").toLowerCase();
  if (!value) return "Não informada";
  if (value.includes("online")) return "Online";
  return "Presencial";
}

export function buildCloserNotification(
  operations: OperationsSettings,
  lead: LeadLike,
  resumo: string,
) {
  const phone = closerPhoneForLead(operations, lead.unit_interest || lead.city);
  const templateName = String(operations.closer_template_name || "").trim();
  const isNewFormat = templateName.includes("lead_quente");
  const params = isNewFormat
    ? [
        sanitizeParam(lead.name || "Lead sem nome"),
        sanitizeParam(formatPhoneDisplay(lead.phone)),
        sanitizeParam(lead.objective || "Não informado"),
        sanitizeParam(lead.unit_interest || lead.city || "Não informada"),
        sanitizeParam(lead.availability || "Não informada"),
        sanitizeParam(leadModalidade(lead)),
        sanitizeParam(resumo || "Sem resumo"),
      ]
    : [
        sanitizeParam(lead.name || "Lead sem nome"),
        sanitizeParam(lead.objective || "Não informado"),
        sanitizeParam(lead.unit_interest || lead.city || "Não informada"),
        sanitizeParam(lead.availability || "Não informada"),
        sanitizeParam(resumo || "Sem resumo"),
      ];
  return { phone, templateName, params };
}
