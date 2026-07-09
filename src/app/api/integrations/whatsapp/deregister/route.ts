import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const confirm = params.get("confirm");
  const acao = params.get("acao") || "deregister";
  if (confirm !== "sim") {
    return NextResponse.json({
      warning:
        "Esta rota limpa o vínculo do número configurado na Cloud API da Meta. Não afeta o WhatsApp Business no celular nem apaga conversas.",
      howTo:
        "Chame com ?confirm=sim para desregistrar, ou ?confirm=sim&acao=excluir para remover o número da conta WhatsApp Business.",
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
    });
  }

  try {
    const token = requireEnv("WHATSAPP_TOKEN");
    const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
    const apiVersion = process.env.WHATSAPP_API_VERSION || "v25.0";

    const target =
      acao === "excluir"
        ? { url: `https://graph.facebook.com/${apiVersion}/${phoneNumberId}`, method: "DELETE" }
        : {
            url: `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/deregister`,
            method: "POST",
          };

    const response = await fetch(target.url, {
      method: target.method,
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = await response.json();
    return NextResponse.json(
      { ok: response.ok, acao, phoneNumberId, result },
      { status: response.ok ? 200 : 502 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao executar a ação." },
      { status: 500 },
    );
  }
}
