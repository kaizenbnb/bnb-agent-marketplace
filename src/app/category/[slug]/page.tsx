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
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
        &larr; Todas las categorías
      </Link>
      <h1 className="mt-3 text-3xl font-bold text-neutral-50">{category.label}</h1>
      <p className="mt-1 text-neutral-400">{category.ruleOfThumb}</p>

      <div className="mt-8 overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">Agente</th>
              <th className="px-4 py-3 font-medium">Protocolo</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Tx onchain</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {agents.map((agent) => (
              <tr key={agent.id} className="text-neutral-200">
                <td className="px-4 py-3 font-medium">{agent.name}</td>
                <td className="px-4 py-3 text-neutral-400">{agent.protocol}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-400">
                    Live · testnet
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-400">{agent.transactions.length}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/agent/${agent.id}`}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                  >
                    Ver ficha
                  </Link>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
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
