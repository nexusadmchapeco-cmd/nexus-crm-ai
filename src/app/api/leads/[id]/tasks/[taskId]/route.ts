import { NextResponse } from "next/server";
import { guardLead } from "@/lib/lead-guard";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const { id, taskId } = await params;
    const guard = await guardLead(id);
    if (guard.response) return guard.response;

    const body = await request.json();
    const status = body.status === "canceled" ? "canceled" : "done";

    // Concluir exige a observação obrigatória do contato.
    const doneNote = String(body.done_note || "").trim();
    if (status === "done" && !doneNote) {
      return NextResponse.json(
        { error: "Escreva a observação do contato para concluir." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    // Concluir também registra a observação na timeline do lead.
    if (status === "done") {
      await supabase.from("lead_notes").insert({
        lead_id: id,
        author_name: body.author_name ? String(body.author_name).slice(0, 120) : null,
        contact_type: ["whatsapp", "ligacao", "presencial", "email", "outro"].includes(
          body.contact_type,
        )
          ? body.contact_type
          : "whatsapp",
        outcome: [
          "atendeu",
          "sem_resposta",
          "vai_pensar",
          "agendou",
          "fechou",
          "perdeu",
        ].includes(body.outcome)
          ? body.outcome
          : "atendeu",
        content: doneNote.slice(0, 4000),
      });
    }

    const { data, error } = await supabase
      .from("lead_tasks")
      .update({
        status,
        done_at: new Date().toISOString(),
        done_note: status === "done" ? doneNote.slice(0, 4000) : null,
      })
      .eq("id", taskId)
      .eq("lead_id", id)
      .select()
      .single();
    if (error) throw error;

    // Concluir e já agendar o próximo contato, se veio uma data.
    let nextTask = null;
    if (status === "done" && body.next_contact_at) {
      const dueAt = new Date(body.next_contact_at);
      if (!Number.isNaN(dueAt.getTime())) {
        const { data: created } = await supabase
          .from("lead_tasks")
          .insert({
            lead_id: id,
            owner_name: body.author_name ? String(body.author_name).slice(0, 120) : null,
            title: String(body.next_contact_title || "Retomar contato").slice(0, 200),
            due_at: dueAt.toISOString(),
          })
          .select()
          .single();
        nextTask = created;
      }
    }

    return NextResponse.json({ task: data, next_task: nextTask });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar a tarefa." },
      { status: 500 },
    );
  }
}
