import { NextResponse } from "next/server";
import { saoPauloDayBounds } from "@/lib/day";
import { createAdminClient } from "@/lib/supabase/admin";

// Contagem de itens que precisam de atenção hoje (atrasados + de hoje),
// para o badge da sidebar.
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { end } = saoPauloDayBounds();
    const { count, error } = await supabase
      .from("lead_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lte("due_at", end.toISOString());
    if (error) throw error;
    return NextResponse.json({ count: count || 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
