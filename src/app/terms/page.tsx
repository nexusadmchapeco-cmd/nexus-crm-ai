import type { Metadata } from "next";
import { LegalShell } from "@/components/legal/legal-shell";

export const metadata: Metadata = {
  title: "Termos de Serviço | Nexus English Center",
  description: "Termos aplicáveis ao atendimento digital da Nexus English Center.",
};

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Condições de uso"
      title="Termos de Serviço"
      description="Estes termos regulam o uso dos canais digitais de atendimento da Nexus English Center, inclusive o atendimento realizado pelo WhatsApp."
    >
      <section>
        <h2>1. Sobre o atendimento</h2>
        <p>Os canais digitais da Nexus English Center permitem solicitar informações sobre cursos, modalidades, unidades, horários e condições comerciais. O atendimento pode ser realizado por automação, inteligência artificial e consultores humanos.</p>
      </section>

      <section>
        <h2>2. Uso adequado</h2>
        <p>Ao utilizar o atendimento, você concorda em fornecer informações verdadeiras e em não usar o serviço para atividades ilícitas, abusivas, fraudulentas ou que prejudiquem a operação, seus colaboradores ou outros usuários.</p>
      </section>

      <section>
        <h2>3. Informações comerciais</h2>
        <p>Informações apresentadas durante a conversa têm caráter informativo. Valores, condições, disponibilidade de turmas e benefícios podem variar e serão confirmados pela equipe comercial antes de qualquer contratação.</p>
      </section>

      <section>
        <h2>4. Inteligência artificial</h2>
        <p>Recursos de inteligência artificial podem auxiliar na geração de respostas, organização de informações e encaminhamento do atendimento. Respostas automatizadas podem conter imprecisões; quando necessário, solicite a confirmação de um atendente humano.</p>
      </section>

      <section>
        <h2>5. Privacidade</h2>
        <p>O tratamento de dados pessoais segue nossa <a href="/privacy">Política de Privacidade</a>. Você também pode consultar as <a href="/data-deletion">instruções para exclusão de dados</a>.</p>
      </section>

      <section>
        <h2>6. Disponibilidade e alterações</h2>
        <p>Podemos atualizar, suspender ou modificar o atendimento digital para manutenção, segurança ou evolução do serviço. Estes termos também podem ser atualizados, e a versão vigente permanecerá disponível nesta página.</p>
      </section>

      <section>
        <h2>7. Contato</h2>
        <p>Dúvidas sobre estes termos podem ser enviadas pelo mesmo WhatsApp utilizado no atendimento ou pelos canais oficiais da Nexus English Center.</p>
      </section>
    </LegalShell>
  );
}
