"use client";

import { useEffect, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import type { Address } from "viem";
import { EXPLORER_TX_BASE } from "@/lib/agents";
import { PERMIT2_TYPES, permit2Domain } from "@/lib/permit2-types";
import HireModal, { type HireModalSubmit } from "./HireModal";

type Status = "idle" | "requesting" | "signing" | "settling" | "done" | "error" | "unavailable";

const PERMIT2_ADDRESS: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const BSC_TESTNET_CHAIN_ID = 97;
const DEFAULT_HIRE_AMOUNT = "1.00";

function randomNonce(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);
}

export default function HireButton({ agentId, agentName }: { agentId: string; agentName: string }) {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [modalOpen, setModalOpen] = useState(false);
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

  async function handleConfirm({ amount, beneficiary }: HireModalSubmit) {
    setModalOpen(false);
    setError(null);
    setElapsed(0);
    try {
      // Step 1: real fetch, no payment yet -> expect 402 with requirements.
      // amount + beneficiary go in the body so the server can quote and
      // later settle against the buyer's own choices.
      setStatus("requesting");
      const res1 = await fetch(`/api/hire/${agentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, beneficiary }),
      });

      if (res1.status === 501) {
        setStatus("unavailable");
        return;
      }
      if (res1.status === 429) {
        const errBody = await res1.json().catch(() => ({}));
        throw new Error(errBody.error || "Too many requests. Try again later.");
      }
      if (res1.status !== 402) {
        const errBody = await res1.json().catch(() => ({}));
        throw new Error(errBody.error || `Expected 402, got ${res1.status}`);
      }
      const body = await res1.json();
      const requirement = body.accepts?.[0];
      if (!requirement) throw new Error("402 response had no payable requirement");

      // Step 2: sign the Permit2 authorization with the CONNECTED wallet --
      // the server never sees a private key, only the resulting signature.
      setStatus("signing");
      if (!address) throw new Error("Wallet disconnected before signing");

      const nonce = randomNonce();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min

      const signature = await signTypedDataAsync({
        domain: permit2Domain(BSC_TESTNET_CHAIN_ID, PERMIT2_ADDRESS),
        types: PERMIT2_TYPES,
        primaryType: "PermitTransferFrom",
        message: {
          permitted: {
            token: requirement.asset as Address,
            amount: BigInt(requirement.maxAmountRequired),
          },
          spender: requirement.extra.spenderAddress as Address,
          nonce,
          deadline,
        },
      });

      const xPaymentPayload = {
        x402Version: 1,
        scheme: "permit2",
        network: "bsc-testnet",
        payload: {
          signature,
          from: address,
          permit: {
            permitted: { token: requirement.asset, amount: requirement.maxAmountRequired },
            spender: requirement.extra.spenderAddress,
            nonce: nonce.toString(),
            deadline: deadline.toString(),
          },
        },
      };
      const xPaymentHeader = btoa(JSON.stringify(xPaymentPayload));

      // Step 3: real second fetch, same endpoint, now WITH the payment header.
      setStatus("settling");
      const res2 = await fetch(`/api/hire/${agentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-PAYMENT": xPaymentHeader },
        body: JSON.stringify({ amount, beneficiary }),
      });
      if (!res2.ok) {
        const errBody = await res2.json().catch(() => ({}));
        // Out of gas is a specific case; show the hint
        if (res2.status === 500 && errBody.hint?.includes("gas")) {
          throw new Error(errBody.error || "Agent wallet is out of gas");
        }
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
    status === "settling" ? `Running the agent, then capturing payment… ${elapsed}s` :
    status === "done" ? "Hired" :
    `Hire ${agentName}`;

  // Disconnected: no competing gold CTA here -- "Connect Wallet" in the
  // header is the one gold button on screen. This just points at it.
  if (!isConnected) {
    return (
      <div className="rounded-md border border-bnb-line px-4 py-3 text-sm text-bnb-muted">
        Connect your wallet (top right) to hire {agentName}.
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        disabled={busy || status === "done"}
        className="rounded-md bg-bnb-gold px-6 py-3 text-sm font-semibold text-bnb-carbon hover:bg-bnb-gold/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {label}
      </button>

      {modalOpen && (
        <HireModal
          agentName={agentName}
          defaultAmount={DEFAULT_HIRE_AMOUNT}
          connectedAddress={address ?? ""}
          onConfirm={handleConfirm}
          onClose={() => setModalOpen(false)}
        />
      )}

      {status === "settling" && (
        <p className="mt-3 text-xs text-bnb-muted">
          Running the agent&apos;s own transaction first, then capturing the Permit2
          payment only if it succeeds, in that order, so nothing is charged if the
          work fails. Typically ~30s; this page is not stuck.
        </p>
      )}

      {status === "unavailable" && (
        <p className="mt-3 text-xs text-bnb-muted">
          The x402 hire flow isn&apos;t wired up for this agent yet, being generalized one
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
