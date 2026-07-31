import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES = ["novo", "contatado", "respondeu", "reuniao", "negociacao", "fechado", "descartado"];

// Salva/atualiza uma empresa no funil de parcerias (dedupe por place_id).
export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    const body = await request.json();
    const placeId = String(body.place_id || "").trim();
    if (!placeId) return NextResponse.json({ error: "place_id é obrigatório." }, { status: 400 });
    const status = STATUSES.includes(body.status) ? body.status : "novo";

    const row: Record<string, unknown> = {
      place_id: placeId,
      status,
      owner_name: body.owner_name ? String(body.owner_name).slice(0, 120) : null,
      note: body.note ? String(body.note).slice(0, 2000) : null,
      contacted_at: status === "contatado" ? new Date().toISOString() : undefined,
    };
    if (body.company_name) row.company_name = String(body.company_name).slice(0, 160);
    if (body.segment) row.segment = String(body.segment).slice(0, 120);
    if (body.city) row.city = String(body.city).slice(0, 80);
    if (body.next_action) row.next_action = String(body.next_action).slice(0, 300);
    if (body.next_action_at) row.next_action_at = body.next_action_at;
    if (session?.role === "vendedor") row.user_id = session.uid;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("prospects")
      .upsert(row, { onConflict: "place_id" })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ prospect: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar prospecção." },
      { status: 500 },
    );
  }
}
