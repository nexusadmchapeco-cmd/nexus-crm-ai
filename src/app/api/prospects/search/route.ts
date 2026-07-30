import { NextResponse } from "next/server";
import { isProbablyWhatsApp, type ProspectStatus } from "@/lib/prospects";
import { createAdminClient } from "@/lib/supabase/admin";

// Busca no Google Places (API nova, searchText). A chamada é feita no servidor;
// a chave nunca vai ao cliente. Guardamos só o place_id + status no banco; os
// dados vêm ao vivo a cada busca, conforme os termos da Places API.
export async function POST(request: Request) {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_PLACES_API_KEY não configurada." },
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
      const errorText = await response.text();
      throw new Error(`Google Places respondeu ${response.status}: ${errorText.slice(0, 200)}`);
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
