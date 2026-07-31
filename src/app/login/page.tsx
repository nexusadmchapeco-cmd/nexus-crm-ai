"use client";

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
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Erro ao entrar.");
      setLoading(false);
    }
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="login-brand">
        <div className="brand-mark">N</div>
        <div>
          <strong>Nexus</strong>
          <span>CRM AI</span>
        </div>
      </div>
      <h1>{bootstrap ? "Criar administrador" : "Entrar"}</h1>
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
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="login-shell">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
