import { KnowledgeBase } from "@/components/knowledge/knowledge-base";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic="force-dynamic";
export default async function KnowledgePage(){
  const {data,error}=await createAdminClient().from("knowledge_articles").select("*").order("priority",{ascending:false}).order("updated_at",{ascending:false});
  return <><div className="page-header"><div><div className="eyebrow">Conteúdo aprovado</div><h1>Base de conhecimento</h1><p>Informações confiáveis para a IA responder sem inventar.</p></div></div><KnowledgeBase initial={data||[]} migrationMissing={Boolean(error)}/></>;
}
