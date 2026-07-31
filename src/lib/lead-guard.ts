import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { scopedUnit, unitVisibleTo } from "@/lib/units";
import type { SessionUser } from "@/lib/auth";

// Defesa em profundidade das rotas de ação sobre um lead: além do middleware,
// cada rota valida que o usuário logado pode agir NESTE lead (vendedor só na
// própria unidade). Retorna a resposta de erro pronta, ou null para seguir.
export async function guardLead(
  leadId: string,
): Promise<{ response: NextResponse | null; session: SessionUser | null }> {
  const session = await getSessionUser();
  // Sem login configurado (modo aberto) não há o que escopar.
  if (!session) return { response: null, session: null };
  const unit = scopedUnit(session);
  if (!unit) return { response: null, session };
  const { data } = await createAdminClient()
    .from("leads")
    .select("unit_interest")
    .eq("id", leadId)
    .maybeSingle();
  if (data && !unitVisibleTo(data.unit_interest, unit)) {
    return {
      response: NextResponse.json(
        { error: "Este lead pertence à outra unidade." },
        { status: 403 },
      ),
      session,
    };
  }
  return { response: null, session };
}
