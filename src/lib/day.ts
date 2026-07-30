// Limites do "hoje" no fuso America/Sao_Paulo (UTC-03:00, sem horário de verão
// desde 2019). Usado pelo "Meu dia" para separar atrasado / hoje.

export function saoPauloDayBounds(reference = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference); // YYYY-MM-DD
  const start = new Date(`${today}T00:00:00-03:00`);
  const end = new Date(`${today}T23:59:59.999-03:00`);
  return { start, end, today };
}
