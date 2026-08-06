import { NextResponse } from "next/server";
import { isProbablyWhatsApp, type ProspectStatus } from "@/lib/prospects";
import { createAdminClient } from "@/lib/supabase/admin";

// Busca no Google Places (API nova, searchText). A chamada é feita no servidor;
// a chave nunca vai ao cliente. Guardamos só o place_id + status no banco; os
// dados vêm ao vivo a cada busca, conforme os termos da Places API.
// O erro cru do Google vem em inglês e num JSON longo, que aparecia inteiro na
// tela do vendedor. Traduz para a causa real e o que fazer.
function explainGoogleError(status: number, raw: string): string {
  let message = "";
  try {
    message = String(JSON.parse(raw)?.error?.message || "");
  } catch {
    message = raw.slice(0, 200);
  }
  const lower = message.toLowerCase();

  if (lower.includes("api key not valid") || lower.includes("api key expired")) {
    return "A chave do Google Places não foi aceita. Confira se colou a chave inteira (sem espaços) no Estúdio de IA e se ela é do mesmo projeto do Google Cloud onde a Places API (New) está ativada.";
  }
  if (lower.includes("referer") || lower.includes("referrer")) {
    return "A chave está restrita a sites (HTTP referrers), mas a busca é feita pelo servidor. No Google Cloud, em Credenciais, mude a restrição de aplicativo dessa chave para \"Nenhuma\".";
  }
  if (lower.includes("has not been used") || lower.includes("is disabled") || lower.includes("service_disabled")) {
    return "A Places API (New) não está ativada no projeto do Google Cloud. Ative em APIs e serviços → Biblioteca → \"Places API (New)\" e tente de novo em alguns minutos.";
  }
  if (lower.includes("billing")) {
    return "O projeto do Google Cloud está sem faturamento ativo — a Places API exige um cartão cadastrado (há cota gratuita mensal).";
  }
  if (status === 429 || lower.includes("quota") || lower.includes("resource_exhausted")) {
    return "Cota do Google Places esgotada por agora. Tente mais tarde ou revise os limites do projeto no Google Cloud.";
  }
  return `Google Places recusou a busca (${status}). ${message.slice(0, 160)}`;
}

export async function POST(request: Request) {
  try {
    let apiKey: string | null = null;
    try {
      const { data: secretRow } = await createAdminClient()
        .from("app_secrets")
        .select("value")
        .eq("name", "google_places_api_key")
        .maybeSingle();
      apiKey = secretRow?.value?.trim() || null;
    } catch {
      apiKey = null;
    }
    if (!apiKey) apiKey = process.env.GOOGLE_PLACES_API_KEY || null;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Chave do Google Places não configurada — salve no Estúdio de IA (aba Encaminhamento)." },
        { status: 503 },
      );
    }
    const body = await request.json();
    const query = String(body.query || "").trim();
    const city = String(body.city || "").trim();
    if (!query) return NextResponse.json({ error: "Informe o tipo de negócio." }, { status: 400 });
    const textQuery = city ? `${query} em ${city}` : query;

    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating",
      },
      body: JSON.stringify({ textQuery, regionCode: "BR", maxResultCount: 20 }),
    });
    if (!response.ok) {
      throw new Error(explainGoogleError(response.status, await response.text()));
    }
    const payload = (await response.json()) as {
      places?: {
        id: string;
        displayName?: { text: string };
        formattedAddress?: string;
        nationalPhoneNumber?: string;
        websiteUri?: string;
        rating?: number;
      }[];
    };
    const places = payload.places || [];

    // Sobrepõe o status de prospecção já salvo (por place_id).
    const ids = places.map((place) => place.id);
    const { data: saved } = await createAdminClient()
      .from("prospects")
      .select("place_id, status")
      .in("place_id", ids.length ? ids : ["__none__"]);
    const statusByPlace = new Map((saved || []).map((row) => [row.place_id, row.status as ProspectStatus]));

    const results = places.map((place) => {
      const phone = place.nationalPhoneNumber || null;
      return {
        place_id: place.id,
        name: place.displayName?.text || "Sem nome",
        address: place.formattedAddress || null,
        phone,
        website: place.websiteUri || null,
        rating: place.rating ?? null,
        probably_whatsapp: isProbablyWhatsApp(phone),
        status: statusByPlace.get(place.id) || "novo",
      };
    });

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro na busca." },
      { status: 500 },
    );
  }
}
