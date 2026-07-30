"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { getStoredSeller, setStoredSeller, type StoredSeller } from "@/lib/seller";

type Seller = { id: string; name: string; role: string };

export function SellerSelect() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [selected, setSelected] = useState<StoredSeller | null>(null);

  useEffect(() => {
    setSelected(getStoredSeller());
    fetch("/api/sellers")
      .then((response) => response.json())
      .then((data) => setSellers(data.sellers || []))
      .catch(() => {});
  }, []);

  function onChange(id: string) {
    const seller = sellers.find((item) => item.id === id) || null;
    const stored = seller ? { id: seller.id, name: seller.name } : null;
    setSelected(stored);
    setStoredSeller(stored);
  }

  return (
    <label className="seller-select" title="Vendedor atual">
      <Icon name="user" size={14} />
      <select value={selected?.id || ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selecionar vendedor</option>
        {sellers.map((seller) => (
          <option key={seller.id} value={seller.id}>
            {seller.name}
          </option>
        ))}
      </select>
    </label>
  );
}
