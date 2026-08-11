import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import AgentCard from "@/components/AgentCard";
import { searchAgents } from "@/lib/agents";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const results = searchAgents(q);

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
        &larr; Inicio
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-neutral-50">
        {q ? `Resultados para "${q}"` : "Todos los agentes"}
      </h1>

      <div className="mt-6">
        <SearchBar initialQuery={q} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {results.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
        {results.length === 0 && (
          <p className="text-neutral-500">Sin resultados. Prueba con "yield", "grid", "venus", "pancakeswap"...</p>
        )}
      </div>
    </main>
  );
}
