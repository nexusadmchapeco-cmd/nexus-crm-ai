import { after, NextResponse } from "next/server";
import { toWhatsAppVoice } from "@/lib/audio";
import { processInbound } from "@/lib/inbound";
import { transcribeAudio } from "@/lib/level-test-ai";
import { parseOperationsSettings } from "@/lib/operations";
import { createAdminClient } from "@/lib/supabase/admin";
import { synthesizeNinaVoice } from "@/lib/voice-server";
import {
  downloadWhatsAppMedia,
  sendTypingIndicator,
  sendWhatsAppAudio,
  sendWhatsAppMessage,
} from "@/lib/whatsapp";

export const maxDuration = 60;

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
    if (!incoming || (incoming.type !== "text" && incoming.type !== "audio")) {
      return NextResponse.json({ received: true });
    }
    const contact = value?.contacts?.[0];

    after(async () => {
      try {
        // Marca como lida e mostra "digitando…" enquanto a Nina pensa.
        await sendTypingIndicator(incoming.id).catch(() => {});
        const isAudio = incoming.type === "audio";
        let messageText = incoming.text?.body || "";
        if (isAudio) {
          // Áudio do lead: baixa a mídia e transcreve para a IA entender.
          const mediaId = incoming.audio?.id;
          if (!mediaId) return;
          const media = await downloadWhatsAppMedia(mediaId);
          const extension = media.mimeType.includes("mpeg") ? "mp3" : "ogg";
          const transcript = (
            await transcribeAudio(
              new File([media.buffer], `lead-audio.${extension}`, { type: media.mimeType }),
            )
          ).trim();
          if (!transcript) return;
          messageText = `🎙️ ${transcript}`;
        }
        if (!messageText.trim()) return;

        const result = await processInbound({
          phone: incoming.from,
          name: contact?.profile?.name,
          message: messageText,
          source: "whatsapp",
          whatsapp_message_id: incoming.id,
        });
        if (!result.ai_reply) return;
        const parts = result.ai_reply_parts?.length
          ? result.ai_reply_parts
          : [result.ai_reply];

        // Ritmo humano: mensagem curta chega bem rápido; texto grande "digita"
        // por no máximo 2s. Só mostra "digitando…" quando a pausa é perceptível.
        const pauseFor = (text: string) =>
          text.length <= 45 ? 300 : Math.min(Math.round(text.length * 16), 2000);
        const isLong = (text: string) => text.length > 45;

        await new Promise((resolve) => setTimeout(resolve, pauseFor(parts[0])));

        // Lead mandou áudio -> Nina responde com áudio (se habilitado);
        // qualquer falha na voz cai para texto, o atendimento nunca para.
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
              // Mostra "gravando áudio" enquanto a voz é gerada.
              await sendTypingIndicator(incoming.id, "audio").catch(() => {});
              const speech = await synthesizeNinaVoice(result.ai_reply, {
                openAiVoice: operations.voice_name || "nova",
                elevenVoiceId: operations.elevenlabs_voice_id,
              });
              // WhatsApp só renderiza como mensagem de voz (bolha com
              // waveform) se o áudio for OGG/Opus mono.
              const voiceNote = await toWhatsAppVoice(speech);
              await sendWhatsAppAudio(
                incoming.from,
                voiceNote.buffer.slice(
                  voiceNote.byteOffset,
                  voiceNote.byteOffset + voiceNote.byteLength,
                ) as ArrayBuffer,
                "audio/ogg",
              );
              voiceSent = true;
            }
          } catch (voiceError) {
            console.error("Voice reply failed, falling back to text", voiceError);
          }
        }
        if (!voiceSent) {
          // Envia cada bolha separada. Só "digita" (com pausa) antes de bolhas
          // maiores; as curtas saem quase na hora.
          for (let index = 0; index < parts.length; index++) {
            if (index > 0) {
              if (isLong(parts[index])) {
                await sendTypingIndicator(incoming.id).catch(() => {});
              }
              await new Promise((resolve) => setTimeout(resolve, pauseFor(parts[index])));
            }
            await sendWhatsAppMessage(incoming.from, parts[index]);
          }
        }
      } catch (error) {
        console.error("WhatsApp background processing error", error);
      }
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("WhatsApp webhook error", error);
    return NextResponse.json({ received: true });
  }
}
