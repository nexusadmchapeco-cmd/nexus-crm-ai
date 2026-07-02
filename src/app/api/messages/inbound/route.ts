import { NextResponse } from "next/server";
import { processInbound } from "@/lib/inbound";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    if (!payload || typeof payload.phone !== "string" || typeof payload.message !== "string") {
      return NextResponse.json({ error: "phone e message são obrigatórios" }, { status: 400 });
    }
    const result = await processInbound(payload);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Inbound error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno ao processar mensagem" },
      { status: 500 },
    );
  }
}
