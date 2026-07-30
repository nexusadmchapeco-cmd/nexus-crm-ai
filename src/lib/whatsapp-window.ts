// Regra das 24 horas da Cloud API da Meta (FASE 0.1).
//
// Fora da janela de 24h desde a ÚLTIMA mensagem recebida do lead, a Meta recusa
// texto livre com o erro 131047 — só modelos aprovados (templates) são
// entregues. Esta função diz se ainda estamos dentro da janela.

import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function isWithin24hWindow(
  supabase: AdminClient,
  leadId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("messages")
    .select("created_at")
    .eq("lead_id", leadId)
    .eq("sender_type", "lead")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.created_at) return false;
  return Date.now() - new Date(data.created_at).getTime() < WINDOW_MS;
}
