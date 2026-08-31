"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { Message } from "@/lib/types";

export function MessageList({ messages }: { messages: Message[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Se o usuário rolou pra cima pra ler, o auto-refresh NÃO pode puxar a
  // conversa pro fim — só rola sozinho quem já estava no fim (como no
  // WhatsApp). Um botão "↓ novas mensagens" aparece quando chega coisa nova
  // enquanto se lê o histórico.
  const pinnedToBottom = useRef(true);
  const lastCount = useRef(messages.length);
  const [hasNew, setHasNew] = useState(false);

  function isNearBottom(container: HTMLDivElement) {
    return container.scrollHeight - container.scrollTop - container.clientHeight < 80;
  }

  function scrollToBottom() {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    pinnedToBottom.current = true;
    setHasNew(false);
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const grew = messages.length > lastCount.current;
    lastCount.current = messages.length;
    if (pinnedToBottom.current) {
      container.scrollTop = container.scrollHeight;
    } else if (grew) {
      setHasNew(true);
    }
  }, [messages]);

  return (
    <div className="messages-wrap">
      <div
        className="messages"
        ref={containerRef}
        onScroll={(event) => {
          const container = event.currentTarget;
          const nearBottom = isNearBottom(container);
          pinnedToBottom.current = nearBottom;
          if (nearBottom) setHasNew(false);
        }}
      >
        {messages.map((message) => (
          <div className={`message ${message.sender_type}`} key={message.id}>
            <div className="bubble">{message.content}</div>
            <div className="message-meta">
              <span>{message.sender_type === "lead" ? "Lead" : message.sender_type === "ai" ? "Nina · IA" : "Equipe Nexus"}</span>
              <span>· {new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.created_at))}</span>
              {message.sender_type !== "lead" && <Icon name="check" size={10} />}
            </div>
          </div>
        ))}
      </div>
      {hasNew && (
        <button type="button" className="messages-new" onClick={scrollToBottom}>
          ↓ Novas mensagens
        </button>
      )}
    </div>
  );
}
