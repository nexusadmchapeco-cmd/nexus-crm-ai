"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";

const APP_ID = "1044757988238138";
const CONFIG_ID = "1739586440707452";
const DEFAULT_WABA_ID = "2027823187360420";
const DEFAULT_PHONE_NUMBER_ID = "264496168466367";
const WHATSAPP_SETTINGS_PATH = "/settings/whatsapp";

type SignupData = {
  wabaId: string;
  phoneNumberId: string;
};

export function WhatsappConnection() {
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState<SignupData | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const codeRef = useRef("");
  const signupRef = useRef<SignupData | null>(null);
  const exchangingRef = useRef(false);

  const exchangeCode = useCallback(async (redirectUri?: string) => {
    if (!codeRef.current || !signupRef.current || exchangingRef.current) return;
    exchangingRef.current = true;
    setMessage("Finalizando a conexão segura com a Meta…");

    try {
      const response = await fetch("/api/integrations/whatsapp/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeRef.current,
          wabaId: signupRef.current.wabaId,
          phoneNumberId: signupRef.current.phoneNumberId,
          redirectUri,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir a conexão.");
      setAccessToken(result.accessToken);
      setConnection(signupRef.current);
      setStatus("connected");
      setMessage("Número conectado. O token está pronto para ser aplicado no ambiente de produção.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Erro ao concluir a conexão.");
    } finally {
      exchangingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorDescription = url.searchParams.get("error_description");
    const legacyConnect = url.searchParams.get("connect");

    if (errorDescription) {
      setStatus("error");
      setMessage(errorDescription);
      window.history.replaceState({}, "", WHATSAPP_SETTINGS_PATH);
      return;
    }

    if (!code) {
      if (legacyConnect) {
        setStatus("idle");
        setMessage("A Meta retornou pelo fluxo antigo. Clique em conectar novamente para usar o fluxo direto corrigido.");
        window.history.replaceState({}, "", WHATSAPP_SETTINGS_PATH);
      }
      return;
    }

    const expectedState = window.sessionStorage.getItem("whatsapp_oauth_state");
    window.sessionStorage.removeItem("whatsapp_oauth_state");
    if (expectedState && state && expectedState !== state) {
      setStatus("error");
      setMessage("A autorização voltou com uma sessão diferente. Atualize a página e tente conectar novamente.");
      window.history.replaceState({}, "", WHATSAPP_SETTINGS_PATH);
      return;
    }

    codeRef.current = code;
    signupRef.current = {
      wabaId: DEFAULT_WABA_ID,
      phoneNumberId: DEFAULT_PHONE_NUMBER_ID,
    };
    setStatus("connecting");
    setMessage("Autorização recebida. Finalizando com o número Nexus Comercial…");
    window.history.replaceState({}, "", WHATSAPP_SETTINGS_PATH);
    void exchangeCode(`${window.location.origin}${WHATSAPP_SETTINGS_PATH}`);
  }, [exchangeCode]);

  function connect() {
    codeRef.current = "";
    signupRef.current = null;
    setConnection(null);
    setAccessToken("");
    setStatus("connecting");
    setMessage("Abrindo a autorização oficial da Meta…");

    const redirectUri = `${window.location.origin}${WHATSAPP_SETTINGS_PATH}`;
    const oauthState = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    window.sessionStorage.setItem("whatsapp_oauth_state", oauthState);

    const authUrl = new URL("https://www.facebook.com/v25.0/dialog/oauth");
    authUrl.searchParams.set("client_id", APP_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("config_id", CONFIG_ID);
    authUrl.searchParams.set("state", oauthState);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("override_default_response_type", "true");
    authUrl.searchParams.set(
      "extras",
      JSON.stringify({
        setup: {},
        featureType: "whatsapp_business_app_onboarding",
        sessionInfoVersion: "3",
      }),
    );

    window.location.assign(authUrl.toString());
  }

  async function copyToken() {
    await navigator.clipboard.writeText(accessToken);
    setMessage("Token copiado. Ele não será exibido na tela.");
  }

  return (
    <div className="whatsapp-connect-layout">
      <section className="whatsapp-connect-card">
        <div className="whatsapp-connect-head">
          <div className="whatsapp-mark"><Icon name="chat" size={23} /></div>
          <div>
            <span>Coexistência</span>
            <h2>Nexus Comercial</h2>
            <p>WhatsApp Business no celular + automação no CRM.</p>
          </div>
          <div className={`connection-status ${status}`}>
            <i />
            {status === "connected" ? "Conectado" : status === "connecting" ? "Conectando" : "Aguardando"}
          </div>
        </div>

        <div className="whatsapp-number">
          <span>Número selecionado</span>
          <strong>+55 54 9676-2019</strong>
          <small>O histórico e o aplicativo móvel permanecem disponíveis.</small>
        </div>

        <div className="connection-steps">
          <div className="done"><b>1</b><span><strong>App publicado</strong><small>Meta for Developers</small></span></div>
          <div className="done"><b>2</b><span><strong>Cadastro incorporado</strong><small>Configuração criada</small></span></div>
          <div className={status === "connected" ? "done" : "active"}><b>3</b><span><strong>Autorizar o número</strong><small>Sem migrar o WhatsApp</small></span></div>
          <div className={status === "connected" ? "active" : ""}><b>4</b><span><strong>Aplicar token</strong><small>Produção na Vercel</small></span></div>
        </div>

        {message && <div className={`connection-message ${status === "error" ? "error" : ""}`}>{message}</div>}

        <div className="connection-actions">
          {status !== "connected" ? (
            <button className="button button-primary" type="button" onClick={connect} disabled={status === "connecting"}>
              <Icon name="chat" size={15} />
              {status === "connecting" ? "Aguardando autorização…" : "Conectar WhatsApp Business"}
            </button>
          ) : (
            <button className="button button-dark" type="button" onClick={copyToken}>
              <Icon name="copy" size={15} />
              Copiar token de produção
            </button>
          )}
        </div>

        {connection && (
          <div className="connection-result">
            <div><span>WhatsApp Account ID</span><strong>{connection.wabaId}</strong></div>
            <div><span>Phone Number ID</span><strong>{connection.phoneNumberId}</strong></div>
          </div>
        )}
      </section>

      <aside className="whatsapp-safety-card">
        <div className="helper-icon"><Icon name="check" size={24} /></div>
        <h3>Seu número continua ativo</h3>
        <p>Este fluxo usa a coexistência oficial da Meta. A equipe continua atendendo pelo WhatsApp Business enquanto o CRM recebe os eventos autorizados.</p>
        <ul>
          <li><Icon name="check" size={13} /> Sem troca de número</li>
          <li><Icon name="check" size={13} /> Sem apagar conversas</li>
          <li><Icon name="check" size={13} /> Webhook oficial da Meta</li>
        </ul>
      </aside>
    </div>
  );
}
