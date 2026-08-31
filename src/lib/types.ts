export type Temperature =
  | "frio"
  | "morno"
  | "quente"
  | "pronto_para_closer"
  | "perdido"
  | "cliente";

export type StageRole =
  | "new_lead"
  | "ai_service"
  | "qualifying"
  | "hot_lead"
  | "not_qualified"
  | "handoff"
  | "closer_owns"
  | "followup"
  | "won"
  | "lost";

export type PipelineStage = {
  id: string;
  name: string;
  position: number;
  color: string;
  role: StageRole | null;
  board_group: "ia" | "closer";
  board_visible: boolean;
  created_at: string;
};

export type Lead = {
  // Briefing ago/2026 (migração 015) — opcionais até a migração rodar.
  modalidade?: "presencial" | "online" | null;
  para_quem?: "propria" | "outra" | null;
  idade_aluno?: string | null;
  qualification_step?: string | null;
  reschedule_count?: number;
  tags?: string[];
  blocked_at?: string | null;
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
  opted_out_at: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  pipeline_stages?: PipelineStage | null;
};

export type LeadContactType = "whatsapp" | "ligacao" | "presencial" | "email" | "outro";
export type LeadNoteOutcome =
  | "atendeu"
  | "sem_resposta"
  | "vai_pensar"
  | "agendou"
  | "fechou"
  | "perdeu";

export type LeadNote = {
  id: string;
  lead_id: string;
  author_name: string | null;
  contact_type: LeadContactType;
  outcome: LeadNoteOutcome;
  content: string;
  created_at: string;
};

export type LeadTask = {
  id: string;
  lead_id: string;
  owner_name: string | null;
  title: string;
  due_at: string;
  status: "pending" | "done" | "canceled";
  done_at: string | null;
  done_note: string | null;
  created_from_note: string | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  lead_id: string;
  channel: string;
  created_at: string;
  updated_at: string;
};

export type LeadEvent = {
  id: string;
  lead_id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
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

export type StagePrompt = {
  id?: string;
  stage_id: string;
  stage_name: string;
  stage_color: string;
  prompt: string;
  active: boolean;
};

export type FollowupStep = {
  id?: string;
  position: number;
  delay_minutes: number;
  message: string;
};

export type FollowupSequence = {
  id?: string;
  name: string;
  trigger_stage_id: string | null;
  active: boolean;
  steps: FollowupStep[];
};

export type FollowupHistoryItem = {
  id: string;
  lead_id: string;
  label: string;
  delay_minutes: number;
  message: string;
  created_at: string;
};

export type OperationsSettings = {
  closer_enabled: boolean;
  closer_name: string;
  closer_phone: string;
  // WhatsApp do closer por unidade: o aviso vai pro closer certo.
  closer_phone_passo_fundo: string;
  closer_phone_chapeco: string;
  closer_template_name: string;
  followup_template_name: string;
  followup_template_names: Record<string, string>;
  campaign_template_names: {
    reactivation: string;
    black_november: string;
    next_month_classes: string;
  };
  language_code: string;
  // Prompt pós-qualificação (briefing §1): template com {modalidade} {unidade}
  // {para_quem} {idade} {nome} {nivel} injetado quando a IA assume.
  post_qualification_prompt: string;
  // Engenharia condicional: texto por situação (chaves de SITUACOES em
  // qualification.ts). Vazio = usa o texto padrão do código.
  situational_prompts: Record<string, string>;
  // Número público do WhatsApp da Nexus (para o link de indicação wa.me).
  public_whatsapp_number: string;
  voice_reply_enabled: boolean;
  voice_name: string;
  elevenlabs_voice_id: string;
};

export type CampaignFilters = {
  stage_ids: string[];
  cities: string[];
  created_from: string | null;
  created_to: string | null;
  interacted_with_ai: boolean;
  did_not_advance: boolean;
  never_replied: boolean;
  exclude_won: boolean;
};

export type CampaignAudienceLead = Pick<
  Lead,
  "id" | "name" | "phone" | "city" | "stage_id" | "created_at" | "last_message_at"
> & {
  stage_name: string;
  reason: string;
};

export type AiDecision = {
  // 1 a 3 mensagens curtas que a Nina envia em sequência (como no WhatsApp).
  reply_messages: string[];
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
    // Coleta conversacional (sem botões): a IA descobre no papo.
    modalidade: "presencial" | "online" | null;
    para_quem: "propria" | "outra" | null;
    idade_aluno: string | null;
  };
  temperature: Temperature;
  should_handoff: boolean;
  suggested_stage: string;
  should_disqualify: boolean;
  disqualify_reason: string | null;
  summary: string;
  next_action: string;
  appointment: {
    should_schedule: boolean;
    type: "experimental_class" | "closer_meeting" | null;
    starts_at: string | null;
    duration_minutes: number | null;
  };
};

export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "no_show" | "cancelled";
export type Appointment = {
  id: string; lead_id: string | null; type: "experimental_class" | "closer_meeting";
  title: string; starts_at: string; ends_at: string; status: AppointmentStatus;
  owner_name: string | null; meeting_url: string | null; notes: string | null;
  created_by: "human" | "ai";
  leads?: Pick<Lead, "id" | "name" | "phone" | "city"> | null;
};
export type LevelTestStatus = "pending" | "in_progress" | "completed" | "abandoned";
export type LevelTest = {
  id: string;
  lead_id: string;
  status: LevelTestStatus;
  cefr_level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null;
  score: number | null;
  answers: unknown[];
  skills?: unknown;
  reviewed_level?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null;
  reviewer_note?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  leads?: Pick<Lead, "id" | "name" | "phone" | "city"> | null;
};

export type AvailabilitySlot = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  type: "experimental_class" | "closer_meeting";
  unit: string | null;
  owner_name: string | null;
  active: boolean;
};
export type CalendarBlock = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  created_at: string;
};
