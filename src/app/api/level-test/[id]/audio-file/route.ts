import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Gera uma signed URL curta para o player tocar o áudio do speaking.
// O path precisa pertencer a este teste (prefixo {id}/), nunca é público.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const path = new URL(request.url).searchParams.get("path") || "";
    if (!path || !path.startsWith(`${id}/`)) {
      return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
    }
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from("level-test-audio")
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Áudio não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar o link do áudio." },
      { status: 500 },
    );
  }
}
