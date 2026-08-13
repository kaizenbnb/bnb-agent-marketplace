"use client";

import { useEffect, useState } from "react";
import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { isAddress, maxUint256, type Address } from "viem";

export type HireModalSubmit = { beneficiary: string };

// Must match HIRE_PRICE_USDT in src/lib/x402.ts -- display only, the server
// never trusts a client-supplied price.
const DISPLAY_PRICE = "1.00 USDT";
const HIRE_PRICE_UNITS = 1_000_000n; // 1.00 USDT, 6 decimals

// Duplicated locally (also in src/lib/venus.ts / HireButton.tsx) rather than
// imported, so this client component doesn't pull server-oriented modules
// (@altananetwork/sdk, ADMIN_PRIVATE_KEY-adjacent code) into the browser bundle.
const USDT_TESTNET: Address = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c";
const PERMIT2_ADDRESS: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export default function HireModal({
  agentName,
  connectedAddress,
  onConfirm,
  onClose,
}: {
  agentName: string;
  connectedAddress: string;
  onConfirm: (values: HireModalSubmit) => void;
  onClose: () => void;
}) {
  const [beneficiary, setBeneficiary] = useState(connectedAddress);
  const beneficiaryValid = /^0x[a-fA-F0-9]{40}$/.test(beneficiary);

  const addressValid = isAddress(connectedAddress);

  const { data: balance, isLoading: balanceLoading } = useReadContract({
    address: USDT_TESTNET,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [connectedAddress as Address],
    query: { enabled: addressValid },
  });

  const { data: allowance, isLoading: allowanceLoading, refetch: refetchAllowance } = useReadContract({
    address: USDT_TESTNET,
    abi: erc20Abi,
    functionName: "allowance",
    args: [connectedAddress as Address, PERMIT2_ADDRESS],
    query: { enabled: addressValid },
  });

  const { writeContract, data: approveHash, isPending: approvePending, error: approveError } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveHash });

  // Once the approval tx confirms, re-read the allowance so the modal moves
  // on to "Confirm & Pay" without the user having to close and reopen it.
  useEffect(() => {
    if (approveConfirmed) refetchAllowance();
  }, [approveConfirmed, refetchAllowance]);

  const checking = balanceLoading || allowanceLoading;
  const insufficientBalance = balance !== undefined && balance < HIRE_PRICE_UNITS;
  const needsApproval = !insufficientBalance && allowance !== undefined && allowance < HIRE_PRICE_UNITS;
  const approving = approvePending || approveConfirming;

  function handleApprove() {
    writeContract({
      address: USDT_TESTNET,
      abi: erc20Abi,
      functionName: "approve",
      args: [PERMIT2_ADDRESS, maxUint256],
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-lg border border-bnb-line bg-bnb-card p-6">
        <h2 className="text-lg font-bold text-bnb-text">Hire {agentName}</h2>

        <div className="mt-4">
          <p className="text-xs font-medium text-bnb-muted">Price</p>
          <p className="mt-1 text-sm text-bnb-text">{DISPLAY_PRICE} <span className="text-bnb-muted">(fixed)</span></p>
        </div>

        <label className="mt-4 block text-xs font-medium text-bnb-muted">
          Beneficiary wallet
          <input
            type="text"
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value)}
            placeholder="0x..."
            className="mt-1 w-full rounded-md border border-bnb-line bg-bnb-carbon px-3 py-2 font-mono text-xs text-bnb-text focus:border-bnb-gold focus:outline-none"
          />
        </label>
        {!beneficiaryValid && beneficiary.length > 0 && (
          <p className="mt-1 text-xs text-red-400">Enter a valid 0x address</p>
        )}

        {checking && (
          <p className="mt-4 text-xs text-bnb-muted">Checking USDT balance and allowance…</p>
        )}

        {!checking && insufficientBalance && (
          <p className="mt-4 text-xs text-red-400">
            This wallet doesn&apos;t hold enough test USDT to cover {DISPLAY_PRICE}. Fund it first, then reopen this dialog.
          </p>
        )}

        {!checking && needsApproval && (
          <p className="mt-4 text-xs text-bnb-muted">
            This wallet hasn&apos;t approved Permit2 to spend its USDT yet. One-time approval, then hiring only needs a signature.
          </p>
        )}
        {approveError && (
          <p className="mt-2 text-xs text-red-400">{approveError.message}</p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-bnb-line px-4 py-2 text-sm font-medium text-bnb-muted hover:text-bnb-text"
          >
            Cancel
          </button>

          {needsApproval ? (
            <button
              type="button"
              disabled={approving}
              onClick={handleApprove}
              className="flex-1 rounded-md bg-bnb-gold px-4 py-2 text-sm font-semibold text-bnb-carbon hover:bg-bnb-gold/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {approving ? "Approving…" : "Approve USDT"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!beneficiaryValid || checking || insufficientBalance}
              onClick={() => onConfirm({ beneficiary })}
              className="flex-1 rounded-md bg-bnb-gold px-4 py-2 text-sm font-semibold text-bnb-carbon hover:bg-bnb-gold/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Confirm &amp; Pay
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
