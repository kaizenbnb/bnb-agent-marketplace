import Link from "next/link";
import type { Agent } from "@/lib/agents";

export default function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link
      href={`/agent/${agent.id}`}
      className="block rounded-lg border border-bnb-line bg-bnb-card p-5 transition hover:border-bnb-gold"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-bnb-text">{agent.name}</h3>
        <span className="shrink-0 rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-400">
          Live · testnet
        </span>
      </div>
      <p className="mt-1 text-xs text-bnb-muted">{agent.protocol}</p>
      <p className="mt-3 text-sm text-bnb-text/80">{agent.summary}</p>
      <p className="mt-3 text-xs text-bnb-muted">{agent.transactions.length} verifiable onchain tx{agent.transactions.length !== 1 ? "s" : ""}</p>
    </Link>
  );
}
