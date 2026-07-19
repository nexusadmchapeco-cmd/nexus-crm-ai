import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/level-test";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  let body: { lead_id?: string | null };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const supabase = createAdminClient();
  const { data: test, error } = await supabase
    .from("level_tests")
    .insert({ lead_id: body.lead_id || null, status: "pending" })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.lead_id) {
    await supabase.from("lead_events").insert({
      lead_id: body.lead_id,
      event_type: "level_test_sent",
      metadata: { level_test_id: test.id, manual: true },
    });
  }
  return NextResponse.json({ id: test.id, url: `${appBaseUrl()}/teste/${test.id}` });
}
