"use server";

import { signerFromPrivateKey, signX402Payment } from "@altananetwork/sdk";

/**
 * Signs an x402 payment requirement server-side. This is the documented
 * fallback: real browser-side signing would need a connected user wallet
 * (MetaMask/WalletConnect), which this app doesn't have -- the constraint
 * isn't CORS specifically, it's that there is no in-browser wallet to sign
 * with in the first place. The two-step HTTP handshake itself (fetch -> 402
 * -> resend with X-PAYMENT) still runs from the browser; only this one
 * cryptographic step is server-side, using the demo session's signer key
 * (never the admin key, and never sent to the client).
 */
export async function signHirePayment(
  requirement: Record<string, unknown>
): Promise<string> {
  const session = {
    walletAddress: process.env.WALLET_ADDRESS as `0x${string}`,
    signer: signerFromPrivateKey(process.env.X402_SESSION_SIGNER_KEY as `0x${string}`),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { header } = await signX402Payment(session as any, requirement as any);
  return header;
}
