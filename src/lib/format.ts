export function formatRelative(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(new Date(date));
}

export function initials(name: string | null, phone: string) {
  if (!name) return phone.slice(-2);
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function labelTemperature(value: string) {
  return value.replaceAll("_", " ");
}

const eventLabels: Record<string, string> = {
  message_received: "Mensagem recebida",
  ai_qualified: "IA avançou a etapa",
  ai_error: "Erro no atendimento da IA",
  human_takeover: "Consultor assumiu",
  returned_to_ai: "Devolvido para a IA",
  appointment_scheduled: "Reunião/aula agendada",
  closer_notified: "Closer avisado",
  closer_notification_error: "Falha ao avisar o closer",
  followup_sent: "Follow-up enviado",
  campaign_sent: "Campanha enviada",
  campaign_failed: "Falha no envio da campanha",
  enrollment_won: "Matrícula fechada",
  lead_lost: "Marcado como perdido",
  ai_disqualified: "IA desqualificou o lead",
};

export function labelEventType(eventType: string) {
  return eventLabels[eventType] || eventType.replaceAll("_", " ");
}
