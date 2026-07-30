"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";

export function Composer({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [windowExpired, setWindowExpired] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setWindowExpired(false);
    const response = await fetch("/api/conversations/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, message }),
    });
    setSending(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      // Fora da janela de 24h: mostra o aviso e oferece o envio por modelo.
      if (response.status === 409 && data.code === "window_expired") {
        setWindowExpired(true);
        return;
      }
      return alert(data.error || "Erro ao enviar");
    }
    setMessage("");
    router.refresh();
  }

  return (
    <div className="composer-wrap">
      {windowExpired && (
        <div className="composer-window-warning" role="alert">
          <Icon name="alert" size={15} />
          <div>
            <strong>Passaram mais de 24h desde a última mensagem do lead.</strong>
            <span>
              O WhatsApp não entrega mais texto livre. Envie um modelo aprovado pela aba
              de campanhas/disparos para reabrir a conversa.
            </span>
          </div>
          <a className="composer-window-cta" href="/campaigns">
            Enviar modelo aprovado
          </a>
        </div>
      )}
      <form className="composer" onSubmit={submit}>
        <textarea
          aria-label="Mensagem"
          placeholder="Digite uma mensagem como consultor..."
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            if (windowExpired) setWindowExpired(false);
          }}
        />
        <button disabled={sending} aria-label="Enviar mensagem">
          <Icon name="send" size={17} />
        </button>
      </form>
    </div>
  );
}
