import type { Metadata } from "next";
import { LegalShell } from "@/components/legal/legal-shell";

export const metadata: Metadata = {
  title: "Política de Privacidade | Nexus English Center",
  description: "Como a Nexus English Center trata dados pessoais em seus canais de atendimento.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Transparência e proteção de dados"
      title="Política de Privacidade"
      description="Esta política explica como a Nexus English Center coleta, utiliza e protege dados pessoais durante o atendimento comercial, inclusive pelo WhatsApp e por recursos de inteligência artificial."
    >
      <section>
        <h2>1. Quem controla os dados</h2>
        <p>A Nexus English Center é responsável pelo tratamento descrito nesta política. A operação atende interessados nas modalidades presencial, em Chapecó e Passo Fundo, e online.</p>
      </section>

      <section>
        <h2>2. Dados que podemos tratar</h2>
        <p>Durante o atendimento, podemos tratar:</p>
        <ul>
          <li>nome, telefone e cidade;</li>
          <li>conteúdo das mensagens e histórico da conversa;</li>
          <li>objetivo com o inglês, nível, modalidade, unidade e disponibilidade;</li>
          <li>origem do contato, campanha e anúncio, quando aplicável;</li>
          <li>resumos comerciais, próxima ação e etapa de atendimento;</li>
          <li>dados técnicos necessários à segurança e ao funcionamento do serviço.</li>
        </ul>
      </section>

      <section>
        <h2>3. Como usamos os dados</h2>
        <p>Usamos os dados para responder solicitações, apresentar opções de cursos, qualificar o interesse, encaminhar o atendimento a um consultor, manter o histórico comercial, prevenir abusos e melhorar a qualidade do atendimento.</p>
        <p>O tratamento pode se apoiar no consentimento, em procedimentos preliminares relacionados a uma possível contratação, no cumprimento de obrigações e no legítimo interesse, sempre observando os direitos previstos na legislação aplicável.</p>
      </section>

      <section>
        <h2>4. Inteligência artificial e atendimento humano</h2>
        <p>O atendimento pode utilizar inteligência artificial para gerar respostas, identificar informações fornecidas na conversa, criar resumos e sugerir a etapa comercial. Um atendente humano pode assumir a conversa a qualquer momento. Não utilizamos esse processo para tomar decisões com efeitos jurídicos ou equivalentes sobre a pessoa.</p>
      </section>

      <section>
        <h2>5. Compartilhamento e operadores</h2>
        <p>Os dados podem ser processados por fornecedores necessários à operação, incluindo Meta/WhatsApp para mensageria, Supabase para banco de dados, OpenAI para recursos de inteligência artificial e Vercel para hospedagem. Esses fornecedores tratam informações conforme seus próprios termos, contratos e medidas de segurança.</p>
        <p>Alguns fornecedores podem processar dados fora do Brasil. Nesses casos, buscamos utilizar serviços com mecanismos adequados de proteção e segurança.</p>
      </section>

      <section>
        <h2>6. Retenção e segurança</h2>
        <p>Mantemos os dados pelo período necessário para prestar o atendimento, preservar o histórico comercial e cumprir obrigações aplicáveis. Depois disso, os dados podem ser excluídos ou anonimizados. Aplicamos controles técnicos e organizacionais compatíveis com a natureza da operação, embora nenhum sistema seja totalmente imune a incidentes.</p>
      </section>

      <section>
        <h2>7. Seus direitos</h2>
        <p>Você pode solicitar confirmação do tratamento, acesso, correção, informação sobre compartilhamento, anonimização, bloqueio, exclusão e revogação do consentimento, quando aplicável.</p>
        <p>As solicitações podem ser feitas pelo mesmo WhatsApp utilizado no atendimento, pelos canais oficiais da Nexus English Center ou pelas unidades. Para exclusão, consulte também nossa página de <a href="/data-deletion">Exclusão de dados</a>.</p>
      </section>

      <section>
        <h2>8. Atualizações</h2>
        <p>Esta política pode ser atualizada para refletir mudanças no atendimento, nos fornecedores ou na legislação. A versão vigente permanecerá disponível nesta página.</p>
      </section>
    </LegalShell>
  );
}
