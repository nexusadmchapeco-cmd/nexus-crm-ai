export type Temperature =
  | "frio"
  | "morno"
  | "quente"
  | "pronto_para_closer"
  | "perdido"
  | "cliente";

export type PipelineStage = {
  id: string;
  name: string;
  position: number;
  color: string;
  created_at: string;
};

export type Lead = {
  id: string;
  name: string | null;
  phone: string;
  city: string | null;
  unit_interest: string | null;
  course_interest: string | null;
  objective: string | null;
  level: string | null;
  availability: string | null;
  urgency: string | null;
  objection: string | null;
  temperature: Temperature;
  stage_id: string;
  owner_id: string | null;
  source: string | null;
  campaign: string | null;
  ad_name: string | null;
  summary: string | null;
  next_action: string | null;
  ai_enabled: boolean;
  human_takeover: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  pipeline_stages?: PipelineStage | null;
};

export type Conversation = {
  id: string;
  lead_id: string;
  channel: string;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  lead_id: string;
  sender_type: "lead" | "ai" | "human";
  content: string;
  whatsapp_message_id: string | null;
  status: string;
  is_ai: boolean;
  created_at: string;
};

export type AiSettings = {
  id: string;
  name: string;
  global_prompt: string;
  model: string;
  temperature: number;
  created_at: string;
  updated_at: string;
};

export type AiDecision = {
  reply: string;
  extracted: {
    name: string | null;
    city: string | null;
    unit_interest: string | null;
    course_interest: string | null;
    objective: string | null;
    level: string | null;
    availability: string | null;
    urgency: string | null;
    objection: string | null;
  };
  temperature: Temperature;
  should_handoff: boolean;
  suggested_stage: string;
  summary: string;
  next_action: string;
};
