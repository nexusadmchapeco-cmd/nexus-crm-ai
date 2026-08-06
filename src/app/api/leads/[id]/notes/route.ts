import { NextResponse } from "next/server";
import { guardLead } from "@/lib/lead-guard";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadContactType, LeadNoteOutcome } from "@/lib/types";

const CONTACT_TYPES: LeadContactType[] = ["whatsapp", "ligacao", "presencial", "email", "outro"];
const OUTCOMES: LeadNoteOutcome[] = [
  "atendeu",
  "sem_resposta",
  "vai_pensar",
  "agendou",
  "fechou",
  "perdeu",
];

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await guardLead(id);
    if (guard.response) return guard.response;

    const supabase = createAdminClient();
    // Eventos relevantes do sistema para a timeline unificada.
    const timelineEvents = [
      "message_received",
      "ai_qualified",
      "campaign_sent",
      "followup_sent",
      "appointment_scheduled",
      "closer_notified",
      "opted_out",
    ];
    const [
      { data: notes, error: notesError },
      { data: tasks, error: tasksError },
      { data: events, error: eventsError },
    ] = await Promise.all([
      supabase
        .from("lead_notes")
        .select("*")
        .eq("lead_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_tasks")
        .select("*")
        .eq("lead_id", id)
        .order("due_at", { ascending: false }),
      supabase
        .from("lead_events")
        .select("id, event_type, metadata, created_at")
        .eq("lead_id", id)
        .in("event_type", timelineEvents)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (notesError) throw notesError;
    if (tasksError) throw tasksError;
    if (eventsError) throw eventsError;
    return NextResponse.json({ notes: notes || [], tasks: tasks || [], events: events || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar o histórico." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await guardLead(id);
    if (guard.response) return guard.response;
    const body = await request.json();
    const content = String(body.content || "").trim();
    if (!content) {
      return NextResponse.json({ error: "Escreva a observação do contato." }, { status: 400 });
    }
    const contactType: LeadContactType = CONTACT_TYPES.includes(body.contact_type)
      ? body.contact_type
      : "whatsapp";
    const outcome: LeadNoteOutcome = OUTCOMES.includes(body.outcome) ? body.outcome : "sem_resposta";
    const session = await getSessionUser();
    const authorName = body.author_name
      ? String(body.author_name).slice(0, 120)
      : session?.name || null;

    const supabase = createAdminClient();
    const { data: note, error: noteError } = await supabase
      .from("lead_notes")
      .insert({
        lead_id: id,
        author_name: authorName,
        contact_type: contactType,
        outcome,
        content: content.slice(0, 4000),
      })
      .select()
      .single();
    if (noteError) throw noteError;

    // Agendar o próximo contato junto: cria uma task vinculada à observação.
    let task = null;
    if (body.next_contact_at) {
      const dueAt = new Date(body.next_contact_at);
      if (!Number.isNaN(dueAt.getTime())) {
        const { data: createdTask, error: taskError } = await supabase
          .from("lead_tasks")
          .insert({
            lead_id: id,
            owner_name: authorName,
            title: String(body.next_contact_title || "Retomar contato").slice(0, 200),
            due_at: dueAt.toISOString(),
            created_from_note: note.id,
          })
          .select()
          .single();
        if (taskError) throw taskError;
        task = createdTask;
      }
    }

    return NextResponse.json({ note, task });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao registrar a observação." },
      { status: 500 },
    );
  }
}
