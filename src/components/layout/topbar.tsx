import { Icon } from "@/components/ui/icon";

export function Topbar() {
  return (
    <header className="topbar">
      <div className="topbar-search">
        <Icon name="search" size={17} />
        <span>Buscar lead, telefone ou conversa</span>
        <kbd>⌘ K</kbd>
      </div>
      <div className="topbar-actions">
        <span className="live-pill"><i />Sistema online</span>
        <button className="icon-button" aria-label="Notificações"><Icon name="bell" /></button>
      </div>
    </header>
  );
}
