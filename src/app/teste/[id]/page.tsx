import type { Metadata } from "next";
import { LevelTestRunner } from "@/components/level-test/level-test-runner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teste de nível de inglês · Nexus English Center",
  description: "Descubra seu nível de inglês em poucos minutos.",
};

export default async function LevelTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LevelTestRunner testId={id} />;
}
