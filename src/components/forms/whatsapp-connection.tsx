"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";

const APP_ID = "1044757988238138";
const CONFIG_ID = "1739586440707452";

type SignupData = {
  wabaId: string;
  phoneNumberId: string;
};

type FacebookLoginResponse = {
  authResponse?: { code?: string };
  status?: string;
};

declare global {
  interface Window {
    FB?: {
      init(options: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void;
      login(
        callback: (response: FacebookLoginResponse) => void,
        options: Record<string, unknown>,
      ): void;
    };
    fbAsyncInit?: () => void;
  }
}

export function WhatsappConnection() {
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState<SignupData | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const codeRef = useRef("");
  const signupRef = useRef<SignupData | null>(null);
  const exchangingRef = useRef(false);

  const exchangeCode = useCallback(async () => {
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
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: APP_ID, cookie: true, xfbml: true, version: "v25.0" });
      setSdkReady(true);
    };

    if (window.FB) {
      window.fbAsyncInit();
    } else if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.src = "https://connect.facebook.net/pt_BR/sdk.js";
      document.body.appendChild(script);
    }

    function receiveMessage(event: MessageEvent) {
      if (!["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin)) return;
      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || typeof payload !== "object") return;
      const data = payload as {
        type?: string;
        event?: string;
        data?: { waba_id?: string; phone_number_id?: string };
      };
      if (data.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "FINISH" && data.data?.waba_id && data.data?.phone_number_id) {
        signupRef.current = {
          wabaId: data.data.waba_id,
          phoneNumberId: data.data.phone_number_id,
        };
        void exchangeCode();
      } else if (data.event === "CANCEL") {
        setStatus("idle");
        setMessage("Conexão cancelada antes da conclusão.");
      } else if (data.event === "ERROR") {
        setStatus("error");
        setMessage("A Meta informou um erro durante o cadastro do número.");
      }
    }

    window.addEventListener("message", receiveMessage);
    return () => window.removeEventListener("message", receiveMessage);
  }, [exchangeCode]);

  function connect() {
    if (!window.FB || !sdkReady) return;
    codeRef.current = "";
    signupRef.current = null;
    setConnection(null);
    setAccessToken("");
    setStatus("connecting");
    setMessage("Conclua a autorização na janela da Meta.");

    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setStatus("idle");
          setMessage("A autorização não foi concluída.");
          return;
        }
        codeRef.current = code;
        void exchangeCode();
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
        },
      },
    );
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
            <button className="button button-primary" type="button" onClick={connect} disabled={!sdkReady || status === "connecting"}>
              <Icon name="chat" size={15} />
              {!sdkReady ? "Carregando Meta…" : status === "connecting" ? "Aguardando autorização…" : "Conectar WhatsApp Business"}
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
