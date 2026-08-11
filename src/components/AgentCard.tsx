import Link from "next/link";
import type { Agent } from "@/lib/agents";

export default function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link
      href={`/agent/${agent.id}`}
      className="block rounded-lg border border-neutral-800 bg-neutral-900 p-5 transition hover:border-emerald-600"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-neutral-100">{agent.name}</h3>
        <span className="shrink-0 rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-400">
          Live · testnet
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-500">{agent.protocol}</p>
      <p className="mt-3 text-sm text-neutral-300">{agent.summary}</p>
      <p className="mt-3 text-xs text-neutral-500">{agent.transactions.length} tx onchain verificable{agent.transactions.length !== 1 ? "s" : ""}</p>
    </Link>
  );
}
