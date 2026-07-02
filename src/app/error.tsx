"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="config-state">
      <h2>Não foi possível carregar os dados</h2>
      <p>Confira a conexão com o Supabase e tente novamente.</p>
      <button className="button button-primary" onClick={reset}>Tentar novamente</button>
    </div>
  );
}
