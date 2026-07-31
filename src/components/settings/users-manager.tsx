"use client";

import { useCallback, useEffect, useState } from "react";

type AppUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "sdr" | "vendedor";
  unit: "chapeco" | "passo_fundo" | null;
  active: boolean;
  created_at: string;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  sdr: "SDR (vê tudo)",
  vendedor: "Vendedor",
};
const UNIT_LABELS: Record<string, string> = {
  chapeco: "Chapecó",
  passo_fundo: "Passo Fundo",
};

export function UsersManager() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("vendedor");
  const [unit, setUnit] = useState("chapeco");
  const [saving, setSaving] = useState(false);

  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/users");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao carregar.");
      setUsers(data.users || []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role, unit: role === "vendedor" ? unit : null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao criar usuário.");
      setName("");
      setEmail("");
      setPassword("");
      setNotice(`Acesso criado para ${data.user.name}.`);
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Erro ao criar usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function patchUser(id: string, patch: Record<string, unknown>, successNotice?: string) {
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao atualizar.");
      if (successNotice) setNotice(successNotice);
      await load();
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "Erro ao atualizar.");
    }
  }

  return (
    <div className="users-shell">
      {error && <div className="vendedor-error">{error}</div>}
      {notice && <div className="users-notice">{notice}</div>}

      <section className="vendedor-form users-create">
        <h3>Novo acesso</h3>
        <p>Vendedor enxerga apenas a unidade dele. SDR e administrador veem tudo.</p>
        <div className="users-form-grid">
          <input placeholder="Nome" value={name} onChange={(event) => setName(event.target.value)} />
          <input
            placeholder="E-mail"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            placeholder="Senha (mín. 8 caracteres)"
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="vendedor">Vendedor</option>
            <option value="sdr">SDR (vê tudo)</option>
            <option value="admin">Administrador</option>
          </select>
          {role === "vendedor" && (
            <select value={unit} onChange={(event) => setUnit(event.target.value)}>
              <option value="chapeco">Chapecó</option>
              <option value="passo_fundo">Passo Fundo</option>
            </select>
          )}
          <button
            type="button"
            disabled={saving || !name.trim() || !email.trim() || password.length < 8}
            onClick={() => void createUser()}
          >
            {saving ? "Criando..." : "Criar acesso"}
          </button>
        </div>
      </section>

      <section className="users-list">
        <h3>Acessos existentes</h3>
        {loading ? (
          <p className="dia-empty">Carregando...</p>
        ) : users.length === 0 ? (
          <p className="dia-empty">Nenhum usuário ainda.</p>
        ) : (
          <ul>
            {users.map((user) => (
              <li key={user.id} className={user.active ? "" : "users-row-inactive"}>
                <div className="users-row-main">
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                  <span className="users-badges">
                    <b>{ROLE_LABELS[user.role]}</b>
                    {user.unit && <b className="users-unit">{UNIT_LABELS[user.unit]}</b>}
                    {!user.active && <b className="users-off">Desativado</b>}
                  </span>
                </div>
                <div className="users-row-actions">
                  {resetUserId === user.id ? (
                    <>
                      <input
                        placeholder="Nova senha"
                        value={resetPassword}
                        onChange={(event) => setResetPassword(event.target.value)}
                      />
                      <button
                        type="button"
                        disabled={resetPassword.length < 8}
                        onClick={() => {
                          void patchUser(user.id, { password: resetPassword }, `Senha de ${user.name} redefinida.`);
                          setResetUserId(null);
                          setResetPassword("");
                        }}
                      >
                        Salvar
                      </button>
                      <button type="button" className="ghost" onClick={() => setResetUserId(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="ghost" onClick={() => setResetUserId(user.id)}>
                        Redefinir senha
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          void patchUser(
                            user.id,
                            { active: !user.active },
                            `${user.name} ${user.active ? "desativado" : "reativado"}.`,
                          )
                        }
                      >
                        {user.active ? "Desativar" : "Reativar"}
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
