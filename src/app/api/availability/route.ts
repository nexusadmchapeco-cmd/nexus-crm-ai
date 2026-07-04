import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (
      !Number.isInteger(Number(body.weekday)) ||
      !body.start_time ||
      !body.end_time ||
      !["experimental_class", "closer_meeting"].includes(body.type)
    ) {
      return NextResponse.json({ error: "Revise o dia, horário e tipo." }, { status: 400 });
    }
    const { data, error } = await createAdminClient()
      .from("availability_slots")
      .insert({
        weekday: Number(body.weekday),
        start_time: body.start_time,
        end_time: body.end_time,
        type: body.type,
        unit: body.unit?.trim() || null,
        owner_name: body.owner_name?.trim() || null,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar disponibilidade." },
      { status: 500 },
    );
  }
}
