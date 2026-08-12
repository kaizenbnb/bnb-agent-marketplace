"use client";

import { useEffect, useState } from "react";
import { signHirePayment } from "@/app/actions/hire";
import { EXPLORER_TX_BASE } from "@/lib/agents";

type Status = "idle" | "requesting" | "signing" | "settling" | "done" | "error" | "unavailable";

export default function HireButton({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ paymentTx: string; workTx: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const busy = status === "requesting" || status === "signing" || status === "settling";

  /**
   * The settling step runs two sequential on-chain transactions (Permit2
   * settlement, then the agent's own work), measured at ~29s end-to-end.
   * Only ~0.9s of that is actual block confirmation at BSC testnet's 0.450s
   * block time -- the rest is SDK relay orchestration (see
   * AGENT_ADVANTAGE_REPORT.md). Either way the label sits unchanged that whole
   * time without a ticking counter, and reads as a frozen UI.
   */
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);

  async function handleHire() {
    setError(null);
    setElapsed(0);
    try {
      // Step 1: real fetch, no payment yet -> expect 402 with requirements.
      setStatus("requesting");
      const res1 = await fetch(`/api/hire/${agentId}`, { method: "POST" });

      if (res1.status === 501) {
        setStatus("unavailable");
        return;
      }
      if (res1.status !== 402) {
        throw new Error(`Expected 402, got ${res1.status}`);
      }
      const body = await res1.json();
      const requirement = body.accepts?.[0];
      if (!requirement) throw new Error("402 response had no payable requirement");

      // Step 2: sign the requirement. No wallet is connected in-browser (no
      // MetaMask/WalletConnect wired up), so this can't actually happen on the
      // client -- documented fallback, server-side signing via a Server Action.
      setStatus("signing");
      const xPaymentHeader = await signHirePayment(requirement);

      // Step 3: real second fetch, same endpoint, now WITH the payment header.
      setStatus("settling");
      const res2 = await fetch(`/api/hire/${agentId}`, {
        method: "POST",
        headers: { "X-PAYMENT": xPaymentHeader },
      });
      if (!res2.ok) {
        const errBody = await res2.json().catch(() => ({}));
        throw new Error(errBody.error || `Settlement failed (${res2.status})`);
      }
      const settled = await res2.json();
      setResult({ paymentTx: settled.payment.txHash, workTx: settled.work.txHash });
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  const label =
    status === "requesting" ? "Requesting terms (402)…" :
    status === "signing" ? "Signing payment…" :
    status === "settling" ? `Settling + running the agent… ${elapsed}s` :
    status === "done" ? "Hired" :
    `Hire ${agentName}`;

  return (
    <div>
      <button
        type="button"
        onClick={handleHire}
        disabled={busy || status === "done"}
        className="rounded-md bg-bnb-gold px-6 py-3 text-sm font-semibold text-bnb-carbon hover:bg-bnb-gold/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {label}
      </button>

      {status === "settling" && (
        <p className="mt-3 text-xs text-bnb-muted">
          Settling the Permit2 payment, then running the agent&apos;s own transaction —
          in that order, so the work only runs if the payment cleared. Typically ~30s;
          this page is not stuck.
        </p>
      )}

      {status === "unavailable" && (
        <p className="mt-3 text-xs text-bnb-muted">
          The x402 hire flow isn't wired up for this agent yet — being generalized one
          agent at a time.
        </p>
      )}

      {status === "error" && (
        <p className="mt-3 text-xs text-red-400">{error}</p>
      )}

      {status === "done" && result && (
        <div className="mt-4 space-y-2">
          <a
            href={`${EXPLORER_TX_BASE}${result.paymentTx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border border-bnb-line bg-bnb-card px-4 py-3 text-sm hover:border-bnb-gold"
          >
            <span className="text-bnb-text/80">Payment settled (Permit2)</span>
            <span className="font-mono text-xs text-bnb-gold">
              {result.paymentTx.slice(0, 10)}…{result.paymentTx.slice(-8)}
            </span>
          </a>
          <a
            href={`${EXPLORER_TX_BASE}${result.workTx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border border-bnb-line bg-bnb-card px-4 py-3 text-sm hover:border-bnb-gold"
          >
            <span className="text-bnb-text/80">Agent work executed</span>
            <span className="font-mono text-xs text-bnb-gold">
              {result.workTx.slice(0, 10)}…{result.workTx.slice(-8)}
            </span>
          </a>
        </div>
      )}
    </div>
  );
}
