import { NextResponse } from "next/server";
import { saoPauloDayBounds } from "@/lib/day";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { scopedUnit, unitVisibleTo } from "@/lib/units";

// Contagem de itens que precisam de atenção hoje (atrasados + de hoje),
// para o badge da sidebar. Vendedor conta só a unidade dele.
export async function GET() {
  try {
    const supabase = createAdminClient();
    const unit = scopedUnit(await getSessionUser());
    const { end } = saoPauloDayBounds();
    const { data, error } = await supabase
      .from("lead_tasks")
      .select("id, lead:leads(unit_interest)")
      .eq("status", "pending")
      .lte("due_at", end.toISOString());
    if (error) throw error;
    const rows = (data || []) as unknown as { lead: { unit_interest: string | null } | null }[];
    const count = rows.filter((row) => unitVisibleTo(row.lead?.unit_interest, unit)).length;
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
