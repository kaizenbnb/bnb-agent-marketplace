"use client";

import { useState } from "react";

export type HireModalSubmit = { beneficiary: string };

// Must match HIRE_PRICE_USDT in src/lib/x402.ts -- display only, the server
// never trusts a client-supplied price.
const DISPLAY_PRICE = "1.00 USDT";

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

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-bnb-line px-4 py-2 text-sm font-medium text-bnb-muted hover:text-bnb-text"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!beneficiaryValid}
            onClick={() => onConfirm({ beneficiary })}
            className="flex-1 rounded-md bg-bnb-gold px-4 py-2 text-sm font-semibold text-bnb-carbon hover:bg-bnb-gold/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Confirm &amp; Pay
          </button>
        </div>
      </div>
    </div>
  );
}
