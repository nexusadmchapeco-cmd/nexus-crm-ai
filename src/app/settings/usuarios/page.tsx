import { redirect } from "next/navigation";
import { UsersManager } from "@/components/settings/users-manager";
import { ConfigRequired } from "@/components/ui/config-required";
import { isSupabaseConfigured } from "@/lib/env";
import { getAuthSecret } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="page-shell">
        <div className="page-header"><div><div className="eyebrow">Configurações</div><h1>Usuários</h1></div></div>
        <ConfigRequired />
      </div>
    );
  }
  const secret = await getAuthSecret();
  if (secret) {
    const user = await getSessionUser();
    if (!user || user.role !== "admin") redirect("/");
  }
  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <div className="eyebrow">Configurações</div>
          <h1>Usuários</h1>
          <p>Crie e gerencie os acessos da equipe: administrador, SDR e vendedores por unidade.</p>
        </div>
      </div>
      <UsersManager />
    </div>
  );
}
