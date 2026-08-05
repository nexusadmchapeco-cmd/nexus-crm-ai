import { NextResponse } from "next/server";
import { guardLead } from "@/lib/lead-guard";
import { buildCloserNotification } from "@/lib/closer-notify";
import { parseOperationsSettings } from "@/lib/operations";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

// Encaminhamento MANUAL para o vendedor: quando o lead está quente mas a IA
// ainda não fez o handoff, a equipe clica e o sistema (1) move o lead para a
// etapa "Qualificado" (fila do vendedor no painel) e (2) avisa o vendedor no
// WhatsApp com o mesmo template resumo_closer do handoff automático.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await guardLead(id);
    if (guard.response) return guard.response;

    const supabase = createAdminClient();
    const [{ data: lead }, { data: stage }, { data: operationsRow }] = await Promise.all([
      supabase.from("leads").select("*").eq("id", id).maybeSingle(),
      supabase.from("pipeline_stages").select("id, name").eq("role", "hot_lead").maybeSingle(),
      supabase.from("ai_settings").select("global_prompt").eq("name", "__operations__").maybeSingle(),
    ]);
    if (!lead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
    if (!stage) return NextResponse.json({ error: "Etapa Qualificado não encontrada." }, { status: 500 });

    if (lead.stage_id !== stage.id) {
      const { error: moveError } = await supabase
        .from("leads")
        .update({ stage_id: stage.id, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (moveError) throw moveError;
    }

    // Aviso no WhatsApp do vendedor (mesmo formato do handoff da IA).
    const operations = parseOperationsSettings(operationsRow?.global_prompt);
    let notified = false;
    let notifyError: string | null = null;
    const notification = buildCloserNotification(
      operations,
      lead,
      `ENVIO MANUAL PELA EQUIPE. ${lead.summary || "Lead quente, atender agora."}`,
    );
    const closerPhone = notification.phone;
    if (closerPhone && notification.templateName) {
      try {
        const sent = await sendWhatsAppTemplate(
          closerPhone,
          notification.templateName,
          operations.language_code,
          notification.params,
        );
        notified = true;
        await supabase.from("lead_events").insert({
          lead_id: id,
          event_type: "closer_notified",
          metadata: {
            manual: true,
            author_name: guard.session?.name || null,
            closer_phone: closerPhone,
            whatsapp_message_id: sent?.messages?.[0]?.id || null,
          },
        });
      } catch (sendError) {
        notifyError = sendError instanceof Error ? sendError.message : "erro no envio";
      }
    } else {
      notifyError = "Telefone/template do vendedor não configurados no Estúdio de IA (aba Encaminhamento).";
    }

    await supabase.from("lead_events").insert({
      lead_id: id,
      event_type: "stage_changed_manually",
      metadata: { stage_id: stage.id, reason: "send_to_seller", author_name: guard.session?.name || null },
    });

    return NextResponse.json({ ok: true, moved_to: stage.name, notified, notify_error: notifyError });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao enviar para o vendedor." },
      { status: 500 },
    );
  }
}
