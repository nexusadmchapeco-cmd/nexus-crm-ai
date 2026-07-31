import { PainelVendedor } from "@/components/painel/painel-vendedor";
import { ConfigRequired } from "@/components/ui/config-required";
import { isSupabaseConfigured } from "@/lib/env";
import { getAuthSecret } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function PainelVendedorPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="page-shell">
        <div className="page-header"><div><div className="eyebrow">Painel do vendedor</div><h1>Painel do Vendedor</h1></div></div>
        <ConfigRequired />
      </div>
    );
  }

  const secret = await getAuthSecret();
  const user = secret ? await getSessionUser() : null;

  // Admin/SDR escolhem qual painel de vendedor estão vendo.
  let vendedores: { id: string; name: string; unit: string | null }[] = [];
  if (user && user.role !== "vendedor") {
    const { data } = await createAdminClient()
      .from("app_users")
      .select("id, name, unit")
      .eq("role", "vendedor")
      .eq("active", true)
      .order("name");
    vendedores = (data || []).map((v) => ({ id: v.id, name: v.name, unit: v.unit }));
  }

  return (
    <PainelVendedor
      viewer={user ? { uid: user.uid, name: user.name, role: user.role, unit: user.unit } : null}
      vendedores={vendedores}
    />
  );
}
