import Link from "next/link";
import { notFound } from "next/navigation";
import { LevelTestReview } from "@/components/level-test/level-test-review";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import { getSessionUser } from "@/lib/session";
import { scopedUnit, unitVisibleTo } from "@/lib/units";
import type { LevelTest } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LevelTestReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isSupabaseConfigured()) notFound();
  const { data: test } = await createAdminClient()
    .from("level_tests")
    .select("*, leads(id,name,phone,city,unit_interest)")
    .eq("id", id)
    .maybeSingle();
  if (!test) notFound();

  // Closer só abre testes da própria unidade (mesma regra da listagem).
  const unit = scopedUnit(await getSessionUser());
  if (
    unit &&
    !unitVisibleTo(
      (test.leads as { unit_interest?: string | null } | null)?.unit_interest ?? null,
      unit,
    )
  ) {
    notFound();
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <div className="eyebrow">
            <Link href="/level-tests">Testes de nível</Link> · Correção
          </div>
          <h1>{(test as LevelTest).leads?.name || "Aluno"}</h1>
          <p>Veja a prova completa e ajuste o nível final se precisar.</p>
        </div>
        <a className="button" href={`/teste/${id}`} target="_blank" rel="noreferrer">
          Abrir teste
        </a>
      </div>
      <LevelTestReview test={test as LevelTest} />
    </div>
  );
}
