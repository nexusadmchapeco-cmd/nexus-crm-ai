import { after, NextResponse } from "next/server";
import { toWhatsAppVoice } from "@/lib/audio";
import { processInbound } from "@/lib/inbound";
import { transcribeAudio } from "@/lib/level-test-ai";
import { parseOperationsSettings } from "@/lib/operations";
import { createAdminClient } from "@/lib/supabase/admin";
import { synthesizeNinaVoice } from "@/lib/voice-server";
import { sendWhatsAppAudio, sendWhatsAppMessage } from "@/lib/whatsapp";
import { getZapiConfig } from "@/lib/zapi";

// Webhook do canal NÃO OFICIAL (Z-API, pareado por QR Code). Recebe o
// ReceivedCallback da instância e injeta a mensagem no MESMO pipeline do
// canal oficial (processInbound) — pro resto do sistema, é tudo igual.
//
// Segurança: a URL configurada na Z-API carrega ?secret=<zapi_webhook_secret>;
// requisições sem o segredo são descartadas.

type ZapiInbound = {
  type?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  phone?: string;
  senderName?: string;
  chatName?: string;
  messageId?: string;
  text?: { message?: string };
  audio?: { audioUrl?: string; mimeType?: string };
  image?: { caption?: string };
  buttonsResponseMessage?: { buttonId?: string; message?: string };
  listResponseMessage?: { message?: string };
};

export async function POST(request: Request) {
  try {
    const config = await getZapiConfig();
    if (!config) return NextResponse.json({ ignored: "zapi não configurada" });
    if (config.webhookSecret) {
      const secret = new URL(request.url).searchParams.get("secret");
      if (secret !== config.webhookSecret) {
        return NextResponse.json({ error: "segredo inválido" }, { status: 403 });
      }
    }

    const body = (await request.json()) as ZapiInbound;
    // Só mensagens recebidas de conversas individuais.
    if (body.fromMe || body.isGroup || !body.phone) {
      return NextResponse.json({ received: true });
    }

    after(async () => {
      try {
        let messageText =
          body.text?.message ||
          body.buttonsResponseMessage?.message ||
          body.listResponseMessage?.message ||
          body.image?.caption ||
          "";
        const isAudio = Boolean(body.audio?.audioUrl);
        if (isAudio) {
          const media = await fetch(body.audio!.audioUrl!, { cache: "no-store" });
          if (!media.ok) return;
          const buffer = await media.arrayBuffer();
          const mime = body.audio?.mimeType || "audio/ogg";
          const extension = mime.includes("mpeg") ? "mp3" : "ogg";
          const transcript = (
            await transcribeAudio(new File([buffer], `lead-audio.${extension}`, { type: mime }))
          ).trim();
          if (!transcript) return;
          messageText = `🎙️ ${transcript}`;
        }
        if (!messageText.trim()) return;

        const result = await processInbound({
          phone: body.phone!,
          name: body.senderName || body.chatName || undefined,
          message: messageText,
          source: "whatsapp",
          whatsapp_message_id: body.messageId || undefined,
          // Sem payload fixo no canal não oficial: respostas de botão viram
          // texto e passam pela interpretação normal (dígitos incluídos).
          button_payload: body.buttonsResponseMessage?.buttonId || null,
        });
        if (!result.ai_reply) return;
        const parts = result.ai_reply_parts?.length ? result.ai_reply_parts : [result.ai_reply];

        // Lead mandou áudio → tenta responder com áudio (mesma regra do canal
        // oficial); falha de voz cai pra texto.
        let voiceSent = false;
        if (isAudio) {
          try {
            const { data: operationsRow } = await createAdminClient()
              .from("ai_settings")
              .select("global_prompt")
              .eq("name", "__operations__")
              .maybeSingle();
            const operations = parseOperationsSettings(operationsRow?.global_prompt);
            if (operations.voice_reply_enabled) {
              const speech = await synthesizeNinaVoice(result.ai_reply, {
                openAiVoice: operations.voice_name || "nova",
                elevenVoiceId: operations.elevenlabs_voice_id,
              });
              const voiceNote = await toWhatsAppVoice(speech);
              await sendWhatsAppAudio(
                body.phone!,
                voiceNote.buffer.slice(
                  voiceNote.byteOffset,
                  voiceNote.byteOffset + voiceNote.byteLength,
                ) as ArrayBuffer,
                "audio/ogg",
              );
              voiceSent = true;
            }
          } catch (voiceError) {
            console.error("[zapi] voz falhou, caindo pra texto", voiceError);
          }
        }
        if (!voiceSent) {
          for (let index = 0; index < parts.length; index++) {
            if (index > 0 && parts[index].length > 60) {
              await new Promise((resolve) => setTimeout(resolve, Math.min(parts[index].length * 9, 1200)));
            }
            await sendWhatsAppMessage(body.phone!, parts[index]);
          }
        }
      } catch (error) {
        console.error("[zapi] erro no processamento", error);
      }
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[zapi] webhook inválido", error);
    return NextResponse.json({ received: true });
  }
}
