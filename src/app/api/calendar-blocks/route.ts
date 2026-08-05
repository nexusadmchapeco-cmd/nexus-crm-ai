import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Fechar agenda (briefing §3.4): bloqueio pontual (data/faixa específica) ou
// permanente/recorrente (ex.: toda segunda 06h–08h, até uma data opcional).
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    if (body.recurring) {
      const weekday = Number(body.weekday);
      const startTime = String(body.start_time || "");
      const endTime = String(body.end_time || "");
      if (
        !Number.isInteger(weekday) ||
        weekday < 0 ||
        weekday > 6 ||
        !/^\d{2}:\d{2}/.test(startTime) ||
        !/^\d{2}:\d{2}/.test(endTime) ||
        endTime <= startTime
      ) {
        return NextResponse.json({ error: "Revise o dia e a faixa de horário." }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("calendar_blocks")
        .insert({
          recurring: true,
          weekday,
          start_time: startTime,
          end_time: endTime,
          until: body.until || null,
          reason: body.reason?.trim() || "Agenda fechada (recorrente)",
        })
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json(data);
    }

    const startsAt = new Date(body.starts_at);
    const endsAt = new Date(body.ends_at);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      return NextResponse.json({ error: "Revise o período do bloqueio." }, { status: 400 });
    }
    const { data: conflictingBlocks, error: blocksError } = await supabase
      .from("calendar_blocks")
      .select("id")
      .eq("recurring", false)
      .lt("starts_at", endsAt.toISOString())
      .gt("ends_at", startsAt.toISOString())
      .limit(1);
    if (blocksError) throw blocksError;
    if (conflictingBlocks?.length) {
      return NextResponse.json({ error: "Esse período já está fechado na agenda." }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("calendar_blocks")
      .insert({
        recurring: false,
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
