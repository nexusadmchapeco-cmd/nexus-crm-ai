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

// Intervalos do período atual (dia/semana/mês) e a data de referência que os
// identifica (dia = hoje, semana = segunda-feira, mês = dia 1). Fuso -03:00.
export function periodBounds(period: "dia" | "semana" | "mes", reference = new Date()) {
  const { today } = saoPauloDayBounds(reference);
  const [year, month, day] = today.split("-").map(Number);
  if (period === "dia") {
    return {
      start: new Date(`${today}T00:00:00-03:00`),
      end: new Date(`${today}T23:59:59.999-03:00`),
      referenceDate: today,
    };
  }
  if (period === "mes") {
    const first = `${year}-${String(month).padStart(2, "0")}-01`;
    const start = new Date(`${first}T00:00:00-03:00`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end, referenceDate: first };
  }
  // semana: segunda a domingo contendo hoje.
  const base = new Date(`${today}T00:00:00-03:00`);
  const weekday = (base.getUTCDay() + 6) % 7; // 0 = segunda
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - weekday);
  const end = new Date(monday);
  end.setUTCDate(monday.getUTCDate() + 7);
  const referenceDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(monday);
  void day;
  return { start: monday, end, referenceDate };
}
