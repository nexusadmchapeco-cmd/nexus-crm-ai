"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";

export function Composer({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    const response = await fetch("/api/conversations/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, message }),
    });
    setSending(false);
    if (!response.ok) return alert((await response.json()).error || "Erro ao enviar");
    setMessage("");
    router.refresh();
  }

  return (
    <form className="composer" onSubmit={submit}>
      <textarea aria-label="Mensagem" placeholder="Digite uma mensagem como consultor..." value={message} onChange={(event) => setMessage(event.target.value)} />
      <button disabled={sending} aria-label="Enviar mensagem"><Icon name="send" size={17} /></button>
    </form>
  );
}
