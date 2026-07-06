import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const startsAt = new Date(body.starts_at);
    const endsAt = new Date(body.ends_at);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      return NextResponse.json({ error: "Revise o período do bloqueio." }, { status: 400 });
    }
    const supabase = createAdminClient();
    const [{ data: conflictingAppointments, error: appointmentsError }, { data: conflictingBlocks, error: blocksError }] =
      await Promise.all([
        supabase
          .from("appointments")
          .select("id")
          .lt("starts_at", endsAt.toISOString())
          .gt("ends_at", startsAt.toISOString())
          .neq("status", "cancelled")
          .limit(1),
        supabase
          .from("calendar_blocks")
          .select("id")
          .lt("starts_at", endsAt.toISOString())
          .gt("ends_at", startsAt.toISOString())
          .limit(1),
      ]);
    if (appointmentsError) throw appointmentsError;
    if (blocksError) throw blocksError;
    if (conflictingAppointments?.length) {
      return NextResponse.json(
        { error: "Já existe um atendimento marcado nesse período." },
        { status: 409 },
      );
    }
    if (conflictingBlocks?.length) {
      return NextResponse.json(
        { error: "Esse período já está fechado na agenda." },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("calendar_blocks")
      .insert({
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        reason: body.reason?.trim() || "Agenda fechada",
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao bloquear agenda." },
      { status: 500 },
    );
  }
}
