// Vendedor selecionado (provisório, sem login): guardado em localStorage e
// enviado como author_name/owner_name nas ações. Não é segurança, é organização.

export type StoredSeller = { id: string; name: string };

const KEY = "nexus_seller";

export function getStoredSeller(): StoredSeller | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredSeller) : null;
  } catch {
    return null;
  }
}

export function setStoredSeller(seller: StoredSeller | null) {
  if (typeof window === "undefined") return;
  if (seller) window.localStorage.setItem(KEY, JSON.stringify(seller));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("seller-changed"));
}
