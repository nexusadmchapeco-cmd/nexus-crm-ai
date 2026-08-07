import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Salva a chave do Google Places por URL (admin-only via middleware
// /api/settings) e TESTA na hora — o mesmo campo continua no Estúdio de IA.
//   ?key=AIza...&confirm=sim
// A chave fica em app_secrets; nunca volta pro navegador.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = (url.searchParams.get("key") || "").trim();
  const confirm = url.searchParams.get("confirm");

  if (!key) {
    return NextResponse.json(
      { error: "Informe ?key=SUA_CHAVE (a do Google Cloud, começa com AIza)." },
      { status: 400 },
    );
  }
  if (confirm !== "sim") {
    return NextResponse.json({
      warning: `Isso salva a chave do Google Places (${key.slice(0, 6)}...${key.slice(-4)}) e testa uma busca real.`,
      howTo: "Chame novamente com &confirm=sim para aplicar.",
    });
  }

  try {
    // Testa ANTES de salvar: chave ruim não entra no sistema.
    const test = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName",
      },
      cache: "no-store",
      body: JSON.stringify({ textQuery: "academias em Chapecó, SC", regionCode: "BR", maxResultCount: 3 }),
    });
    const payload = await test.json();
    if (!test.ok) {
      return NextResponse.json(
        {
          error: "O Google recusou essa chave — nada foi salvo.",
          motivo: payload?.error?.message || `HTTP ${test.status}`,
          dica: "Confira: Places API (New) ativada, restrição de aplicativo em 'Nenhuma' e faturamento ligado no projeto.",
        },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("app_secrets").upsert(
      { name: "google_places_api_key", value: key, updated_at: new Date().toISOString() },
      { onConflict: "name" },
    );
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      chave_salva: `${key.slice(0, 6)}...${key.slice(-4)}`,
      teste: `Google respondeu com ${(payload.places || []).length} empresa(s) — chave válida.`,
      proximoPasso: "Abra Parcerias no menu e busque um segmento.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : `Erro ao salvar: ${JSON.stringify(error)}` },
      { status: 500 },
    );
  }
}
