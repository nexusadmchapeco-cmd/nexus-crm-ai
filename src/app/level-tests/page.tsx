import { ConfigRequired } from "@/components/ui/config-required";
import { Icon } from "@/components/ui/icon";
import { getLevelTests } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { formatRelative } from "@/lib/format";
import { levelLabels, type TestLevel } from "@/lib/level-test";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  pending: "Link enviado, não iniciado",
  in_progress: "Começou, não terminou",
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
          <p>
            Quando o lead conta que já tem inglês, a IA envia o teste adaptativo (CEFR A1–B2)
            automaticamente. Resultados aparecem aqui na hora.
          </p>
        </div>
      </div>
      {!configured ? (
        <ConfigRequired />
      ) : !tests.length ? (
        <div className="config-state">
          <Icon name="report" size={26} />
          <p>Nenhum teste enviado ainda.</p>
          <p>
            Assim que um lead disser no WhatsApp que já estudou inglês, a IA envia o link do teste
            e o resultado aparece nesta tela.
          </p>
        </div>
      ) : (
        <div className="level-test-list">
          {tests.map((test) => {
            const cefr = test.cefr_level as TestLevel | null;
            return (
              <div className="level-test-row" key={test.id}>
                <div>
                  <strong>{test.leads?.name || test.leads?.phone || "Lead"}</strong>
                  <span>
                    {statusLabels[test.status] || test.status}
                    {" · "}
                    {formatRelative(test.completed_at || test.started_at || test.created_at)}
                    {" · "}
                    <a href={`/teste/${test.id}`} target="_blank" rel="noreferrer">
                      abrir teste
                    </a>
                  </span>
                </div>
                <div className="level-test-badge">
                  {cefr ? `${cefr} · ${levelLabels[cefr]}` : "—"}
                </div>
                <div className="level-test-score">{test.score ?? "—"}</div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
