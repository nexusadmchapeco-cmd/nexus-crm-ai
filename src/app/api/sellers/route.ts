import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("sellers")
      .select("*")
      .eq("active", true)
      .order("name");
    if (error) throw error;
    return NextResponse.json({ sellers: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao listar vendedores." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Informe o nome." }, { status: 400 });
    const role = ["sdr", "closer", "gestor"].includes(body.role) ? body.role : "closer";
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("sellers")
      .insert({
        name: name.slice(0, 120),
        phone: body.phone ? String(body.phone).slice(0, 40) : null,
        role,
        unit: body.unit ? String(body.unit).slice(0, 80) : null,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ seller: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar vendedor." },
      { status: 500 },
    );
  }
}
