import { NextResponse } from "next/server";
import { parseOperationsSettings } from "@/lib/operations";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const adminPin = process.env.CRM_ADMIN_PIN;
    if (!adminPin) {
      return NextResponse.json({ error: "CRM_ADMIN_PIN não configurado" }, { status: 503 });
    }
    if (String(body.admin_pin || "") !== adminPin) {
      return NextResponse.json({ error: "PIN de segurança inválido." }, { status: 401 });
    }
    const leadIds = Array.isArray(body.lead_ids) ? body.lead_ids.slice(0, 200) : [];
    if (!body.confirmed || !leadIds.length || !body.name?.trim() || !body.template_name?.trim()) {
      return NextResponse.json(
        { error: "Confirme o público, o nome da campanha e o modelo aprovado." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const [
      { data: leads, error: leadsError },
      { data: operationsRow, error: operationsError },
    ] = await Promise.all([
      supabase.from("leads").select("id,name,phone").in("id", leadIds),
      supabase
        .from("ai_settings")
        .select("global_prompt")
        .eq("name", "__operations__")
        .maybeSingle(),
    ]);
    if (leadsError) throw leadsError;
    if (operationsError) throw operationsError;
    const operations = parseOperationsSettings(operationsRow?.global_prompt);
    const campaignId = crypto.randomUUID();
    const results = { sent: 0, failed: 0 };

    for (const lead of leads || []) {
      const personalizedText = String(body.message || "")
        .replaceAll("{{nome}}", lead.name || "tudo bem")
        .slice(0, 1000);
      try {
        const sent = await sendWhatsAppTemplate(
          lead.phone,
          body.template_name,
          body.language_code || operations.language_code,
          [lead.name || "tudo bem"],
        );
        const whatsappMessageId = sent?.messages?.[0]?.id || null;
        const { data: conversation } = await supabase
          .from("conversations")
          .select("id")
          .eq("lead_id", lead.id)
          .maybeSingle();
        await Promise.all([
          supabase.from("lead_events").insert({
            lead_id: lead.id,
            event_type: "campaign_sent",
            metadata: {
              campaign_id: campaignId,
              campaign_name: body.name.trim(),
              template_name: body.template_name.trim(),
              message: personalizedText,
              whatsapp_message_id: whatsappMessageId,
            },
          }),
          conversation
            ? supabase.from("messages").insert({
                conversation_id: conversation.id,
                lead_id: lead.id,
                sender_type: "human",
                content: personalizedText,
                whatsapp_message_id: whatsappMessageId,
                status: "sent",
                is_ai: false,
              })
            : Promise.resolve(),
        ]);
        results.sent += 1;
      } catch (error) {
        await supabase.from("lead_events").insert({
          lead_id: lead.id,
          event_type: "campaign_failed",
          metadata: {
            campaign_id: campaignId,
            campaign_name: body.name.trim(),
            error: error instanceof Error ? error.message : "Erro desconhecido",
          },
        });
        results.failed += 1;
      }
    }

    return NextResponse.json({ ok: true, campaign_id: campaignId, ...results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao enviar campanha" },
      { status: 500 },
    );
  }
}
