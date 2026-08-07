"use client";

// A porta de entrada do sistema — a experiência "wow" (pedido do diretor):
// atmosfera de sala de controle, com o núcleo orbital da marca (leads
// circulando até a IA puxar pro centro), grade de horizonte, aurora e o
// ticker vivo da operação. Tudo CSS puro — nada de libs, nada pesado.
// O gem central troca a letra "N" pela logo nova quando os assets chegarem.

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bootstrap, setBootstrap] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/bootstrap")
      .then((response) => response.json())
      .then((data) => setBootstrap(Boolean(data.needed)))
      .catch(() => {});
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(bootstrap ? "/api/auth/bootstrap" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bootstrap ? { name, email, password } : { email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao entrar.");
      const next = searchParams.get("next");
      // Vendedor cai direto no Painel do Vendedor.
      const home = data.user?.role === "vendedor" ? "/painel-vendedor" : "/";
      router.replace(next && next.startsWith("/") ? next : home);
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Erro ao entrar.");
      setLoading(false);
    }
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="login-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/branding/nexus-crm-logo-transparent.svg" alt="Nexus CRM" />
      </div>
      <h1>{bootstrap ? "Criar administrador" : "Entrar na operação"}</h1>
      <p>
        {bootstrap
          ? "Primeiro acesso: crie a conta administrativa do painel."
          : "Acesso restrito à equipe comercial."}
      </p>
      {error && <div className="login-error">{error}</div>}
      {bootstrap && (
        <>
          <label htmlFor="login-name">Nome</label>
          <input
            id="login-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </>
      )}
      <label htmlFor="login-email">E-mail</label>
      <input
        id="login-email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <label htmlFor="login-password">{bootstrap ? "Senha (mín. 8 caracteres)" : "Senha"}</label>
      <input
        id="login-password"
        type="password"
        autoComplete={bootstrap ? "new-password" : "current-password"}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      <button
        type="submit"
        disabled={loading || !email || !password || (bootstrap && (!name || password.length < 8))}
      >
        {loading ? "Entrando..." : bootstrap ? "Criar e entrar" : "Entrar"}
      </button>
      <div className="login-live">
        <i />
        Nina em operação — atendendo leads agora
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="login-shell">
      {/* Atmosfera: aurora, estrelas e a grade de horizonte */}
      <div className="lg-aurora lg-aurora-ember" aria-hidden />
      <div className="lg-aurora lg-aurora-nebula" aria-hidden />
      <div className="lg-stars" aria-hidden>
        <span /><span /><span /><span /><span /><span /><span /><span />
      </div>
      <div className="lg-grid" aria-hidden />

      <div className="login-stage">
        <div className="lg-hero">
          {/* Núcleo orbital: os leads circulam, a IA puxa pro centro. */}
          <div className="lg-core" aria-hidden>
            <div className="lg-orbit lg-orbit-a"><i /><i className="d2" /></div>
            <div className="lg-orbit lg-orbit-b"><i /><i className="d2" /><i className="d3" /></div>
            <div className="lg-halo" />
            <div className="lg-gem">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/branding/nexus-crm-icon.svg" alt="" />
            </div>
          </div>
          <div className="lg-copy">
            <div className="lg-eyebrow">Nexus English Center · Operação comercial</div>
            <h2 className="lg-headline">
              A IA atende.
              <em>O seu time fecha.</em>
            </h2>
            <p className="lg-sub">
              Leads do WhatsApp qualificados pela Nina e entregues quentes, dia e noite.
            </p>
          </div>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
