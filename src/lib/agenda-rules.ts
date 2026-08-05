// Regras de agendamento (briefing §3.2), aplicadas como VALIDAÇÃO no backend
// (não só instrução de prompt):
// - Manhã (antes das 12h): só a partir do dia seguinte. Nunca manhã do mesmo dia.
// - Tarde (12h–18h) e noite (18h+): podem ser no mesmo dia, com no mínimo
//   2 horas de antecedência.
// Cortes padrão sugeridos no briefing; ajustáveis aqui num lugar só.

import type { SupabaseClient } from "@supabase/supabase-js";

const MORNING_END_HOUR = 12;
export const MIN_SAME_DAY_HOURS = 2;

function spParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: new Date(`${get("year")}-${get("month")}-${get("day")}T12:00:00-03:00`).getUTCDay(),
  };
}

export function validateSlotRules(startsAt: Date, now = new Date()): string | null {
  const slot = spParts(startsAt);
  const current = spParts(now);
  const sameDay = slot.date === current.date;
  if (sameDay && slot.hour < MORNING_END_HOUR) {
    return "Reunião de manhã só pode ser marcada a partir do dia seguinte.";
  }
  if (sameDay && startsAt.getTime() - now.getTime() < MIN_SAME_DAY_HOURS * 3600000) {
    return `Reunião no mesmo dia precisa de pelo menos ${MIN_SAME_DAY_HOURS}h de antecedência.`;
  }
  return null;
}

// Texto injetado no contexto da IA para ela nem oferecer horário inválido.
export function slotRulesPrompt(now = new Date()) {
  const current = spParts(now);
  const agora = `${String(current.hour).padStart(2, "0")}:${String(current.minute).padStart(2, "0")}`;
  return (
    `REGRAS DE AGENDAMENTO (obrigatórias — agora são ${agora} de ${current.date}): ` +
    `NUNCA ofereça horário de manhã (antes das 12h) do dia de hoje — manhã só a partir de amanhã. ` +
    `Horário de tarde/noite pode ser hoje, mas somente com pelo menos 2 horas de antecedência do horário atual. ` +
    `Nunca ofereça horários dentro de bloqueios da agenda.`
  );
}

// Bloqueios: pontuais (starts_at/ends_at) e recorrentes (weekday + faixa de
// horário, opcionalmente até uma data). A IA nunca agenda dentro deles.
export async function isBlocked(
  supabase: SupabaseClient,
  startsAt: Date,
  endsAt: Date,
): Promise<boolean> {
  const [{ data: pontual }, { data: recorrentes }] = await Promise.all([
    supabase
      .from("calendar_blocks")
      .select("id")
      .eq("recurring", false)
      .lt("starts_at", endsAt.toISOString())
      .gt("ends_at", startsAt.toISOString())
      .limit(1)
      .maybeSingle(),
    supabase
      .from("calendar_blocks")
      .select("weekday, start_time, end_time, until")
      .eq("recurring", true),
  ]);
  if (pontual) return true;
  const slot = spParts(startsAt);
  const slotMinutes = slot.hour * 60 + slot.minute;
  const slotEnd = spParts(endsAt);
  const slotEndMinutes = slotEnd.hour * 60 + slotEnd.minute;
  for (const block of recorrentes || []) {
    if (block.weekday !== slot.weekday) continue;
    if (block.until && block.until < slot.date) continue;
    const [bh, bm] = String(block.start_time || "00:00").split(":").map(Number);
    const [eh, em] = String(block.end_time || "23:59").split(":").map(Number);
    const blockStart = bh * 60 + (bm || 0);
    const blockEnd = eh * 60 + (em || 0);
    if (slotMinutes < blockEnd && slotEndMinutes > blockStart) return true;
  }
  return false;
}
