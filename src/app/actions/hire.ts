"use server";

import { signerFromPrivateKey, signX402Payment } from "@altananetwork/sdk";
import { isConfigComplete } from "@/lib/config";

export type SignHireResult = { header: string } | { error: string };

/**
 * Signs an x402 payment requirement server-side. This is the documented
 * fallback: real browser-side signing would need a connected user wallet
 * (MetaMask/WalletConnect), which this app doesn't have -- the constraint
 * isn't CORS specifically, it's that there is no in-browser wallet to sign
 * with in the first place. The two-step HTTP handshake itself (fetch -> 402
 * -> resend with X-PAYMENT) still runs from the browser; only this one
 * cryptographic step is server-side, using the demo session's signer key
 * (never the admin key, and never sent to the client).
 *
 * Returns a discriminated result instead of throwing: a thrown error inside
 * a Server Action is sanitized by Next.js in production into an opaque
 * "Minified React error #441" with no actionable message, which is exactly
 * what happened here when WALLET_ADDRESS was missing in Production. Failing
 * as a normal return value keeps the real message visible to the caller.
 */
export async function signHirePayment(
  requirement: Record<string, unknown>
): Promise<SignHireResult> {
  if (!isConfigComplete()) {
    return { error: "Server is not fully configured. Check /api/health for details." };
  }

  try {
    const session = {
      walletAddress: process.env.WALLET_ADDRESS as `0x${string}`,
      signer: signerFromPrivateKey(process.env.X402_SESSION_SIGNER_KEY as `0x${string}`),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { header } = await signX402Payment(session as any, requirement as any);
    return { header };
  } catch (err) {
    console.error("[signHirePayment] Failed to sign payment:", String(err));
    return { error: "Failed to sign the payment authorization." };
  }
}
