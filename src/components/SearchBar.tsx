"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SearchBar({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xl gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar agentes por nombre, protocolo o categoría..."
        className="flex-1 rounded-md border border-bnb-line bg-bnb-card px-4 py-2 text-sm text-bnb-text placeholder:text-bnb-muted focus:border-bnb-gold focus:outline-none"
      />
      <button
        type="submit"
        className="rounded-md bg-bnb-gold px-4 py-2 text-sm font-semibold text-bnb-carbon hover:bg-bnb-gold/90"
      >
        Buscar
      </button>
    </form>
  );
}
