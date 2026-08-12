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
        &larr; All categories
      </Link>
      <h1 className="mt-3 text-3xl font-bold text-bnb-text">{category.label}</h1>
      <p className="mt-1 text-bnb-muted">{category.ruleOfThumb}</p>

      {agents.length === 0 && (
        <div className="mt-8 rounded-lg border border-bnb-line bg-bnb-card p-6 text-center text-bnb-muted">
          No agents in this category yet.
        </div>
      )}

      {agents.length === 1 && (
        <Link
          href={`/agent/${agents[0].id}`}
          className="mt-8 flex flex-col gap-6 rounded-lg border border-bnb-line bg-bnb-card p-8 transition hover:border-bnb-gold sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-bnb-text">{agents[0].name}</h2>
              <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-400">
                Live · testnet
              </span>
            </div>
            <p className="mt-1 text-sm text-bnb-muted">{agents[0].protocol}</p>
            <p className="mt-3 max-w-xl text-sm text-bnb-text/80">{agents[0].summary}</p>
            <p className="mt-3 text-xs text-bnb-muted">
              {agents[0].transactions.length} verifiable onchain tx{agents[0].transactions.length !== 1 ? "s" : ""}
            </p>
          </div>
          <span className="shrink-0 self-start rounded-md bg-bnb-gold px-5 py-2.5 text-sm font-semibold text-bnb-carbon hover:bg-bnb-gold/90 sm:self-center">
            View profile
          </span>
        </Link>
      )}

      {agents.length > 1 && (
        <div className="mt-8 overflow-x-auto rounded-lg border border-bnb-line">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-bnb-card text-bnb-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Protocol</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Onchain tx</th>
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
                      View profile
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
