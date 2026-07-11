import { ConfigRequired } from "@/components/ui/config-required";
import { Icon } from "@/components/ui/icon";
import { getLevelTests } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  pending: "Aguardando início",
  in_progress: "Em andamento",
  completed: "Concluído",
  abandoned: "Abandonado",
};

export default async function LevelTestsPage() {
  const configured = isSupabaseConfigured();
  const tests = configured ? await getLevelTests() : [];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Operação comercial</div>
          <h1>Testes de nível</h1>
          <p>Resultados do teste de nível de inglês aplicado automaticamente pela IA.</p>
        </div>
      </div>
      {!configured ? (
        <ConfigRequired />
      ) : !tests.length ? (
        <div className="config-state">
          <Icon name="report" size={26} />
          <p>Nenhum teste realizado ainda.</p>
          <p>
            A estrutura já está pronta no banco de dados; a aplicação automática do teste pela
            IA (quando o lead informar que já tem algum nível de inglês) ainda será construída.
          </p>
        </div>
      ) : (
        <div className="level-test-list">
          {tests.map((test) => (
            <div className="level-test-row" key={test.id}>
              <div>
                <strong>{test.leads?.name || test.leads?.phone || "Lead"}</strong>
                <span>{statusLabels[test.status] || test.status}</span>
              </div>
              <div className="level-test-badge">{test.cefr_level || "—"}</div>
              <div className="level-test-score">{test.score ?? "—"}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
