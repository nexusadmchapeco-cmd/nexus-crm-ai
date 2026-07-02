import { NextResponse } from "next/server";
import { processInbound } from "@/lib/inbound";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Token de verificação inválido" }, { status: 403 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const incoming = value?.messages?.[0];
    if (!incoming || incoming.type !== "text") return NextResponse.json({ received: true });
    const contact = value?.contacts?.[0];

    // O processamento é aguardado no MVP para garantir consistência. Em produção,
    // mova esta chamada para uma fila e responda à Meta imediatamente.
    await processInbound({
      phone: incoming.from,
      name: contact?.profile?.name,
      message: incoming.text?.body || "",
      source: "whatsapp",
      whatsapp_message_id: incoming.id,
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("WhatsApp webhook error", error);
    return NextResponse.json({ received: true });
  }
}
