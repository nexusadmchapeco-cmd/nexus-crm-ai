import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiSettings, Lead, Message, PipelineStage } from "@/lib/types";

export async function getStages(): Promise<PipelineStage[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await createAdminClient()
    .from("pipeline_stages")
    .select("*")
    .order("position");
  if (error) throw error;
  return data;
}

export async function getLeads(): Promise<Lead[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await createAdminClient()
    .from("leads")
    .select("*, pipeline_stages(*)")
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  return data as Lead[];
}

export async function getMessages(leadId: string): Promise<Message[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await createAdminClient()
    .from("messages")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function getAiSettings(): Promise<AiSettings | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await createAdminClient()
    .from("ai_settings")
    .select("*")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
