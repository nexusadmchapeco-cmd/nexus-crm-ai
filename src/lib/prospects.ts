// Helpers de prospecção (client-safe).

export type ProspectStatus =
  | "novo"
  | "contatado"
  | "respondeu"
  | "reuniao"
  | "fechado"
  | "descartado";

export type ProspectResult = {
  place_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  probably_whatsapp: boolean;
  status: ProspectStatus;
};

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  novo: "Novo",
  contatado: "Contatado",
  respondeu: "Respondeu",
  reuniao: "Reunião",
  fechado: "Fechado",
  descartado: "Descartado",
};

function digits(phone: string) {
  return phone.replace(/\D/g, "");
}

// Celular no Brasil: 9 dígitos começando com 9 após o DDD. Não é garantia de
// WhatsApp, só um provável — daí o selo "provável".
export function isProbablyWhatsApp(phone: string | null) {
  if (!phone) return false;
  const d = digits(phone);
  if (d.length === 11) return d[2] === "9";
  if (d.length === 13 && d.startsWith("55")) return d[4] === "9";
  return false;
}

export function toWaMeNumber(phone: string) {
  const d = digits(phone);
  if (d.startsWith("55")) return d;
  return `55${d}`;
}
