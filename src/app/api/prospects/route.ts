import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES = ["novo", "contatado", "respondeu", "reuniao", "fechado", "descartado"];

// Salva/atualiza o status da prospecção de um place_id (só isso é guardado).
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const placeId = String(body.place_id || "").trim();
    if (!placeId) return NextResponse.json({ error: "place_id é obrigatório." }, { status: 400 });
    const status = STATUSES.includes(body.status) ? body.status : "novo";

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("prospects")
      .upsert(
        {
          place_id: placeId,
          status,
          owner_name: body.owner_name ? String(body.owner_name).slice(0, 120) : null,
          note: body.note ? String(body.note).slice(0, 2000) : null,
          contacted_at: status === "contatado" ? new Date().toISOString() : undefined,
        },
        { onConflict: "place_id" },
      )
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
