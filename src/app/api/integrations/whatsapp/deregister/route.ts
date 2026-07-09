import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";

export async function GET(request: Request) {
  const confirm = new URL(request.url).searchParams.get("confirm");
  if (confirm !== "sim") {
    return NextResponse.json({
      warning:
        "Esta ação remove o registro do número configurado na Cloud API da Meta. Não afeta o WhatsApp Business no celular nem apaga conversas.",
      howTo: "Chame novamente com ?confirm=sim para executar.",
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
    });
  }

  try {
    const token = requireEnv("WHATSAPP_TOKEN");
    const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
    const apiVersion = process.env.WHATSAPP_API_VERSION || "v25.0";

    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/deregister`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const result = await response.json();
    return NextResponse.json(
      { ok: response.ok, phoneNumberId, result },
      { status: response.ok ? 200 : 502 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao desregistrar o número." },
      { status: 500 },
    );
  }
}
