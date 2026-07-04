import { Icon } from "@/components/ui/icon";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

export async function Topbar() {
  let notificationCount = 0;
  try {
    const { count } = await createAdminClient()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    notificationCount = count || 0;
  } catch {
    notificationCount = 0;
  }
  return (
    <header className="topbar">
      <div className="topbar-search">
        <Icon name="search" size={17} />
        <span>Buscar lead, telefone ou conversa</span>
        <kbd>⌘ K</kbd>
      </div>
      <div className="topbar-actions">
        <span className="live-pill"><i />Sistema online</span>
        <Link className="icon-button topbar-bell" aria-label={`${notificationCount} notificações`} href="/agenda">
          <Icon name="bell" />
          {notificationCount > 0 && <b>{notificationCount > 9 ? "9+" : notificationCount}</b>}
        </Link>
      </div>
    </header>
  );
}
