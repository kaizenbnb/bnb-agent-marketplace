import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategory, getAgentsByCategory, CATEGORIES } from "@/lib/agents";

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();

  const agents = getAgentsByCategory(slug);

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <Link href="/" className="text-sm text-bnb-muted hover:text-bnb-gold">
        &larr; Todas las categorías
      </Link>
      <h1 className="mt-3 text-3xl font-bold text-bnb-text">{category.label}</h1>
      <p className="mt-1 text-bnb-muted">{category.ruleOfThumb}</p>

      <div className="mt-8 overflow-x-auto rounded-lg border border-bnb-line">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-bnb-card text-bnb-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Agente</th>
              <th className="px-4 py-3 font-medium">Protocolo</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Tx onchain</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bnb-line">
            {agents.map((agent) => (
              <tr key={agent.id} className="text-bnb-text/90">
                <td className="px-4 py-3 font-medium">{agent.name}</td>
                <td className="px-4 py-3 text-bnb-muted">{agent.protocol}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-400">
                    Live · testnet
                  </span>
                </td>
                <td className="px-4 py-3 text-bnb-muted">{agent.transactions.length}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/agent/${agent.id}`}
                    className="rounded-md bg-bnb-gold px-3 py-1.5 text-xs font-semibold text-bnb-carbon hover:bg-bnb-gold/90"
                  >
                    Ver ficha
                  </Link>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-bnb-muted">
                  Sin agentes en esta categoría todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
