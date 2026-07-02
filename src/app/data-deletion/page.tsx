import type { Metadata } from "next";
import { LegalShell } from "@/components/legal/legal-shell";

export const metadata: Metadata = {
  title: "Exclusão de Dados | Nexus English Center",
  description: "Instruções para solicitar a exclusão de dados pessoais na Nexus English Center.",
};

export default function DataDeletionPage() {
  return (
    <LegalShell
      eyebrow="Controle sobre seus dados"
      title="Solicitação de exclusão de dados"
      description="Você pode solicitar a exclusão dos dados pessoais vinculados ao atendimento da Nexus English Center de forma simples e gratuita."
    >
      <section>
        <h2>Como solicitar</h2>
        <ol>
          <li>Abra a conversa de WhatsApp utilizada no atendimento da Nexus English Center.</li>
          <li>Envie a mensagem: <strong>“EXCLUIR MEUS DADOS”</strong>.</li>
          <li>Informe apenas os dados necessários para confirmarmos que o pedido pertence ao titular.</li>
          <li>Aguarde a confirmação de recebimento e conclusão pelo canal de atendimento.</li>
        </ol>
        <p>Se não tiver acesso à conversa, faça a solicitação por um canal oficial da Nexus English Center ou presencialmente em uma das unidades.</p>
      </section>

      <section>
        <h2>O que será excluído</h2>
        <p>Serão excluídos ou anonimizados os dados pessoais e comerciais associados ao atendimento, incluindo cadastro do lead, histórico de mensagens, resumo e informações de qualificação, salvo quando a conservação for necessária para cumprir obrigação legal, exercer direitos ou prevenir fraude.</p>
      </section>

      <section>
        <h2>Confirmação e prazo</h2>
        <p>A Nexus poderá solicitar uma confirmação razoável de identidade para impedir que terceiros excluam dados indevidamente. O pedido será tratado no menor prazo possível, considerando a complexidade técnica e as obrigações aplicáveis.</p>
      </section>

      <section>
        <h2>Revogação de autorização</h2>
        <p>Você também pode pedir para não receber novas mensagens comerciais. Basta escrever <strong>“PARAR”</strong> no WhatsApp. Isso interrompe novos contatos, sem impedir a conservação mínima exigida por lei.</p>
      </section>
    </LegalShell>
  );
}
