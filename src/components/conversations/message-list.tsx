"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import type { Message } from "@/lib/types";

export function MessageList({ messages }: { messages: Message[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  return (
    <div className="messages" ref={containerRef}>
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
  );
}
