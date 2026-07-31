"use client";

// Lista de conversas com busca por nome ou telefone (filtra ao digitar).

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { formatRelative, initials } from "@/lib/format";

export type ConversationItem = {
  id: string;
  name: string | null;
  phone: string;
  last_message_at: string;
  preview: string;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function ConversationList({
  items,
  selectedId,
}: {
  items: ConversationItem[];
  selectedId: string | null;
}) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return items;
    const digits = q.replace(/\D/g, "");
    return items.filter((item) => {
      if (item.name && normalize(item.name).includes(q)) return true;
      if (digits && item.phone.replace(/\D/g, "").includes(digits)) return true;
      return false;
    });
  }, [items, query]);

  return (
    <>
      <label className="conversation-search conversation-search-active">
        <Icon name="search" size={14} />
        <input
          placeholder="Buscar por nome ou telefone"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button type="button" aria-label="Limpar busca" onClick={() => setQuery("")}>
            <Icon name="x" size={12} />
          </button>
        )}
      </label>
      <div className="conversation-list-items">
        {visible.length === 0 && (
          <p className="dia-empty" style={{ padding: "14px 16px" }}>
            Nenhuma conversa encontrada{query ? ` para “${query}”` : ""}.
          </p>
        )}
        {visible.map((item) => (
          <Link
            href={`/conversations?lead=${item.id}`}
            key={item.id}
            className={`conversation-item ${item.id === selectedId ? "active" : ""}`}
          >
            <div className="avatar">{initials(item.name, item.phone)}</div>
            <div className="conversation-item-body">
              <div>
                <strong>{item.name || item.phone}</strong>
                <time>{formatRelative(item.last_message_at)}</time>
              </div>
              <p>{item.preview}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
