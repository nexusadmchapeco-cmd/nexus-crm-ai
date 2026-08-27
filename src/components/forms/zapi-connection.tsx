"use client";

// Canal NÃO OFICIAL (Z-API): conecta um WhatsApp comum por QR Code e liga o
// chaveamento — com o canal ativo, todos os envios do sistema saem por ele
// (sem templates da Meta, sem janela de 24h; botões viram opções numeradas).

import { useCallback, useEffect, useState } from "react";

type ZapiState = {
  configured: boolean;
  enabled: boolean;
  connected?: boolean;
  smartphone_connected?: boolean;
  instance_hint?: string;
  status_error?: string | null;
};

export function ZapiConnection() {
  const [state, setState] = useState<ZapiState | null>(null);
  const [instanceId, setInstanceId] = useState("");
  const [instanceToken, setInstanceToken] = useState("");
  const [clientToken, setClientToken] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/integrations/zapi");
      const data = await response.json();
      if (response.ok) setState(data);
    } catch {
      // silencioso: o cartão mostra o formulário vazio
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setNotice(null);
    try {
      const response = await fetch("/api/integrations/zapi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro na Z-API.");
      return data;
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Erro na Z-API.", ok: false });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function salvar() {
    const data = await call("save", {
      instance_id: instanceId,
      instance_token: instanceToken,
      client_token: clientToken,
    });
    if (data) {
      setNotice({
        text: data.webhook?.ok
          ? "Credenciais salvas e webhook apontado pro CRM. Agora gere o QR Code e escaneie."
          : "Credenciais salvas. Não consegui apontar o webhook automaticamente — clique em “Reapontar webhook”.",
        ok: Boolean(data.webhook?.ok),
      });
      setInstanceId("");
      setInstanceToken("");
      setClientToken("");
      await load();
    }
  }

  async function gerarQr() {
    const data = await call("qr");
    if (!data) return;
    if (data.connected) {
      setQr(null);
      setNotice({ text: "Já conectado — não precisa de QR. ✅", ok: true });
    } else if (data.image) {
      setQr(String(data.image).startsWith("data:") ? data.image : `data:image/png;base64,${data.image}`);
      setNotice({ text: "Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho, e escaneie.", ok: true });
    } else {
      setNotice({ text: "A Z-API não devolveu o QR — confira as credenciais e tente de novo.", ok: false });
    }
    await load();
  }

  async function alternar() {
    const data = await call("toggle", { enabled: !state?.enabled });
    if (data) {
      setNotice({
        text: data.enabled
          ? "Canal não oficial LIGADO — todos os envios agora saem pelo número conectado via QR."
          : "Canal não oficial desligado — os envios voltam pra API oficial da Meta.",
        ok: true,
      });
      await load();
    }
  }

  return (
    <section className="settings-card zapi-card">
      <div className="pv-card-h">
        <h3>Canal não oficial (Z-API) — conexão por QR Code</h3>
        {state?.enabled ? (
          <span className="pv-chip pv-c-green">ATIVO — ENVIANDO POR AQUI</span>
        ) : (
          <span className="pv-chip pv-c-orange">RESERVA</span>
        )}
      </div>
      <p className="pv-sub">
        Alternativa quando a API oficial da Meta está travada: um WhatsApp comum pareado por QR Code.
        Sem templates e sem janela de 24h — os botões viram opções numeradas (1, 2, 3).{" "}
        <strong>Atenção:</strong> canal não oficial tem risco de banimento do número — prefira um número
        dedicado ao comercial. Crie a instância em z-api.io e cole as credenciais abaixo.
      </p>

      {notice && <div className={`lm-envio ${notice.ok ? "ok" : "warn"}`}>{notice.text}</div>}

      {state?.configured && (
        <div className="zapi-status">
          <span>
            Instância <b>{state.instance_hint}</b> ·{" "}
            {state.connected ? "📱 Conectada ao WhatsApp" : "❌ Sem WhatsApp pareado"}
            {state.status_error ? ` · ${state.status_error}` : ""}
          </span>
        </div>
      )}

      <div className="zapi-grid">
        <input
          placeholder="ID da instância"
          value={instanceId}
          onChange={(event) => setInstanceId(event.target.value)}
        />
        <input
          placeholder="Token da instância"
          value={instanceToken}
          onChange={(event) => setInstanceToken(event.target.value)}
        />
        <input
          placeholder="Client-Token da conta (segurança)"
          value={clientToken}
          onChange={(event) => setClientToken(event.target.value)}
        />
      </div>
      <div className="zapi-actions">
        <button
          type="button"
          className="pv-btn pv-btn-sm"
          disabled={busy !== null || !instanceId.trim() || !instanceToken.trim()}
          onClick={() => void salvar()}
        >
          {busy === "save" ? "Salvando..." : "Salvar credenciais"}
        </button>
        {state?.configured && (
          <>
            <button type="button" className="pv-btn-green pv-btn-sm" disabled={busy !== null} onClick={() => void gerarQr()}>
              {busy === "qr" ? "Gerando..." : "Gerar QR Code"}
            </button>
            <button
              type="button"
              className="pv-btn-ghost pv-btn-sm"
              disabled={busy !== null}
              onClick={() =>
                void call("set-webhook").then((data) => {
                  if (!data) return;
                  setNotice(
                    data.ok
                      ? { text: "Webhook reapontado pro CRM. ✅", ok: true }
                      : {
                          text: `A Z-API recusou o webhook: ${JSON.stringify(data.body || data).slice(0, 160)}`,
                          ok: false,
                        },
                  );
                })
              }
            >
              Reapontar webhook
            </button>
            <button
              type="button"
              className={state.enabled ? "pv-btn-ghost pv-btn-sm" : "pv-btn pv-btn-sm"}
              disabled={busy !== null}
              onClick={() => void alternar()}
            >
              {state.enabled ? "Desligar canal não oficial" : "Usar este canal pros envios"}
            </button>
          </>
        )}
      </div>

      {qr && (
        <div className="zapi-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR Code para conectar o WhatsApp" />
          <small>
            WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho. O QR expira rápido — se falhar,
            gere outro.
          </small>
        </div>
      )}
    </section>
  );
}
