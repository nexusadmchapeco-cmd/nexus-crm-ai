import Link from "next/link";

export function LegalShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link href="/" className="legal-brand" aria-label="Nexus CRM AI">
          <span>N</span>
          <div><strong>Nexus</strong><small>English Center</small></div>
        </Link>
        <nav aria-label="Documentos legais">
          <Link href="/privacy">Privacidade</Link>
          <Link href="/data-deletion">Exclusão de dados</Link>
        </nav>
      </header>
      <main className="legal-main">
        <div className="legal-hero">
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p>{description}</p>
          <span>Última atualização: 2 de julho de 2026</span>
        </div>
        <article className="legal-content">{children}</article>
      </main>
      <footer className="legal-footer">
        <span>© 2026 Nexus English Center</span>
        <span>Chapecó · Passo Fundo · Online</span>
      </footer>
    </div>
  );
}
