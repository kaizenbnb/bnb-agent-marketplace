import Link from "next/link";
import { notFound } from "next/navigation";
import { AGENTS, getAgent, getCategory, EXPLORER_TX_BASE, EXPLORER_ADDRESS_BASE } from "@/lib/agents";
import HireButton from "@/components/HireButton";
import HealthFactorGauge from "@/components/HealthFactorGauge";

export function generateStaticParams() {
  return AGENTS.map((a) => ({ id: a.id }));
}

export default async function AgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) notFound();
  const category = getCategory(agent.category);

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      {category && (
        <Link href={`/category/${category.slug}`} className="text-sm text-bnb-muted hover:text-bnb-gold">
          &larr; {category.label}
        </Link>
      )}

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-bnb-text">{agent.name}</h1>
          <p className="mt-1 text-sm text-bnb-muted">{agent.protocol} · {agent.chain}</p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-900/50 px-3 py-1 text-xs font-medium text-emerald-400">
          Live · testnet
        </span>
      </div>

      <p className="mt-6 text-bnb-text/80">{agent.description}</p>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-bnb-muted">Agentic Wallet</h2>
        <a
          href={`${EXPLORER_ADDRESS_BASE}${agent.wallet}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block rounded-md border border-bnb-line bg-bnb-card px-3 py-2 font-mono text-xs text-bnb-gold hover:border-bnb-gold"
        >
          {agent.wallet}
        </a>
      </div>

      {agent.healthFactorGauge && (
        <div className="mt-8">
          <HealthFactorGauge {...agent.healthFactorGauge} />
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-bnb-muted">Real Metrics</h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {agent.metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-lg border border-bnb-line bg-bnb-card p-4 transition hover:border-bnb-gold/60"
            >
              <dt className="text-xs text-bnb-muted">{m.label}</dt>
              <dd className="mt-1 text-sm font-medium text-bnb-text">{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-bnb-muted">
          Onchain Transactions ({agent.transactions.length})
        </h2>
        <ul className="mt-3 space-y-2">
          {agent.transactions.map((tx) => (
            <li key={tx.hash}>
              <a
                href={`${EXPLORER_TX_BASE}${tx.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-lg border border-bnb-line bg-bnb-card px-4 py-3 text-sm hover:border-bnb-gold"
              >
                <span className="text-bnb-text/80">{tx.label}</span>
                <span className="font-mono text-xs text-bnb-gold">
                  {tx.hash.slice(0, 10)}…{tx.hash.slice(-8)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      {agent.caveat && (
        <div className="mt-8 rounded-lg border border-amber-900/50 bg-amber-950/30 p-4 text-sm text-amber-300">
          <strong className="font-semibold">Honest note:</strong> {agent.caveat}
        </div>
      )}

      <div className="mt-10 border-t border-bnb-line pt-8">
        <HireButton agentName={agent.name} />
      </div>
    </main>
  );
}
