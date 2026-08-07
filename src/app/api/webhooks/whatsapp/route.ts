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

    // Avisos de ENTREGA da Meta (sent → delivered → read, ou failed com o
    // motivo). Sem isso, uma mensagem que a Meta aceita mas não entrega some
    // sem deixar rastro. Falha vira log de erro (aparece nos logs da Vercel).
    const statuses = value?.statuses as
      | {
          id?: string;
          status?: string;
          recipient_id?: string;
          errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
        }[]
      | undefined;
    if (statuses?.length) {
      // Guarda os últimos 30 retornos em app_secrets (sem migração) para
      // consulta em /api/settings/ai/whatsapp-status — os logs da Vercel não
      // indexam saída de console, e sem isso a falha fica invisível.
      after(async () => {
        try {
          const supabase = createAdminClient();
          const { data: row } = await supabase
            .from("app_secrets")
            .select("value")
            .eq("name", "whatsapp_delivery_log")
            .maybeSingle();
          let anteriores: unknown[] = [];
          try {
            anteriores = JSON.parse(row?.value || "[]");
          } catch {
            anteriores = [];
          }
          const novos = statuses.map((status) => ({
            quando: new Date().toISOString(),
            status: status.status,
            para: status.recipient_id,
            message_id: status.id,
            erro: status.errors?.[0]
              ? {
                  codigo: status.errors[0].code,
                  titulo: status.errors[0].title,
                  mensagem: status.errors[0].message,
                  detalhes: status.errors[0].error_data?.details,
                }
              : null,
          }));
          await supabase.from("app_secrets").upsert(
            {
              name: "whatsapp_delivery_log",
              value: JSON.stringify([...novos, ...anteriores].slice(0, 30)),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "name" },
          );
        } catch {
          // diagnóstico não pode derrubar o webhook
        }
      });
      if (!value?.messages?.length) return NextResponse.json({ received: true });
    }

    const incoming = value?.messages?.[0];
    const supportedTypes = ["text", "audio", "button", "interactive"];
    if (!incoming || !supportedTypes.includes(incoming.type)) {
      return NextResponse.json({ received: true });
    }
    const contact = value?.contacts?.[0];

    after(async () => {
      try {
        // Marca como lida e mostra "digitando…" — sem travar: a IA já começa
        // a processar em paralelo, ganhando o tempo dessa chamada.
        void sendTypingIndicator(incoming.id).catch(() => {});
        const isAudio = incoming.type === "audio";
        // Cliques de botão chegam como type "button" (quick reply de template,
        // com payload) ou "interactive" (button_reply/list_reply). O payload
        // roteia ações fixas; o texto visível entra na conversa normalmente.
        const buttonPayload: string | null =
          incoming.type === "button"
            ? incoming.button?.payload || null
            : incoming.type === "interactive"
              ? incoming.interactive?.button_reply?.id ||
                incoming.interactive?.list_reply?.id ||
                null
              : null;
        let messageText =
          incoming.text?.body ||
          incoming.button?.text ||
          incoming.interactive?.button_reply?.title ||
          incoming.interactive?.list_reply?.title ||
          "";
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
          button_payload: buttonPayload,
        });
        if (!result.ai_reply) return;
        const parts = result.ai_reply_parts?.length
          ? result.ai_reply_parts
          : [result.ai_reply];

        // Ritmo humano enxuto: curta = quase instantânea; texto grande "digita"
        // por no máximo ~1,2s. Só mostra "digitando…" quando a pausa é perceptível.
        const pauseFor = (text: string) =>
          text.length <= 60 ? 0 : Math.min(Math.round(text.length * 9), 1200);
        const isLong = (text: string) => text.length > 60;

        if (pauseFor(parts[0]) > 0) {
          await new Promise((resolve) => setTimeout(resolve, pauseFor(parts[0])));
        }

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
