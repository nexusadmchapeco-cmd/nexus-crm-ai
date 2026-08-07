import { NextResponse } from "next/server";
import { defaultOperationsSettings, parseOperationsSettings } from "@/lib/operations";
import { DEFAULT_POST_QUALIFICATION_PROMPT, SITUACOES } from "@/lib/qualification";
import { createAdminClient } from "@/lib/supabase/admin";

// Preenche o Estúdio de IA com tudo que já se sabe da operação — telefones
// dos closers (do CRM antigo), template lead_quente, prompt pós-qualificação
// e os 14 blocos da engenharia condicional, prontos para editar. Não
// sobrescreve nada que o Guilherme já tenha configurado (só preenche vazios;
// exceção: closer_template_name vira lead_quente, decisão já tomada).
// Rota admin-only (middleware /api/settings). Chamar com ?confirm=sim.

const KNOWN = {
  closer_phone_passo_fundo: "5554999658474", // Lucas — PF + Online
  closer_phone_chapeco: "5549988971344", // Jaziel — Chapecó
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const confirm = url.searchParams.get("confirm");
  // prompts=refazer força os textos NOVOS do pitch de conexão por cima dos
  // blocos atuais (use quando os padrões do código evoluírem).
  const refazerPrompts = url.searchParams.get("prompts") === "refazer";
  if (confirm !== "sim") {
    return NextResponse.json({
      warning:
        "Isso preenche o Estúdio de IA com os telefones dos closers, o template lead_quente, o prompt pós-qualificação e os 14 blocos condicionais (sem apagar nada já configurado).",
      howTo:
        "Chame novamente com ?confirm=sim para aplicar. Acrescente &prompts=refazer para atualizar os blocos de prompt para a versão mais recente do pitch.",
    });
  }
  try {
    const supabase = createAdminClient();
    const { data: row } = await supabase
      .from("ai_settings")
      .select("global_prompt")
      .eq("name", "__operations__")
      .maybeSingle();
    const current = parseOperationsSettings(row?.global_prompt);

    const filled: string[] = [];
    const kept: string[] = [];
    const setIfEmpty = (key: string, currentValue: string, next: string) => {
      if (currentValue.trim()) {
        kept.push(key);
        return currentValue;
      }
      filled.push(key);
      return next;
    };

    const situational: Record<string, string> = { ...current.situational_prompts };
    for (const situation of SITUACOES) {
      if (refazerPrompts || !(situational[situation.key] || "").trim()) {
        situational[situation.key] = situation.default;
        filled.push(`situacional:${situation.key}`);
      } else {
        kept.push(`situacional:${situation.key}`);
      }
    }

    const next = {
      ...current,
      closer_enabled: true,
      closer_phone_passo_fundo: setIfEmpty(
        "closer_phone_passo_fundo (Lucas)",
        current.closer_phone_passo_fundo,
        KNOWN.closer_phone_passo_fundo,
      ),
      closer_phone_chapeco: setIfEmpty(
        "closer_phone_chapeco (Jaziel)",
        current.closer_phone_chapeco,
        KNOWN.closer_phone_chapeco,
      ),
      closer_template_name: "lead_quente",
      post_qualification_prompt: refazerPrompts
        ? DEFAULT_POST_QUALIFICATION_PROMPT
        : setIfEmpty(
            "post_qualification_prompt",
            current.post_qualification_prompt,
            DEFAULT_POST_QUALIFICATION_PROMPT,
          ),
      situational_prompts: situational,
    };

    const { error } = await supabase.from("ai_settings").upsert(
      { name: "__operations__", global_prompt: JSON.stringify(next) },
      { onConflict: "name" },
    );
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      preenchidos: filled,
      mantidos: kept,
      closer_template_name: "lead_quente",
      faltaVoce: [
        "Número público de WhatsApp (link de indicação + tarefa dos 30 dias) — Estúdio de IA → Encaminhamento",
        "Chave do Google Places (busca de Parcerias)",
      ],
      defaults: defaultOperationsSettings.language_code,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao preencher." },
      { status: 500 },
    );
  }
}
