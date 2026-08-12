import { createClient, BNB_TESTNET, signerFromPrivateKey, PERMIT2_ADDRESS } from "@altananetwork/sdk";
import { generatePrivateKey } from "viem/accounts";
import { parseUnits, parseEther } from "viem";
import { appendFileSync } from "fs";

/**
 * One-time provisioning for the x402 Hire flow. Run manually once (not part
 * of the live app): grants a long-lived, persistent session (explicit signer
 * key, not the SDK's random default, so the API route can reconstruct the
 * same session on every request), then approves Permit2 to move USDT and
 * registers Permit2 as a valid ERC-1271 checker for that session.
 *
 * Persists X402_SESSION_SIGNER_KEY to .env.local for the API route to reuse.
 */

const USDT = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c";
const VUSDT = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";

const wallet = { address: process.env.WALLET_ADDRESS };
const adminSigner = signerFromPrivateKey(process.env.ADMIN_PRIVATE_KEY);
const client = createClient({ chains: [BNB_TESTNET] });

console.log("=== Provisioning x402 session for wallet:", wallet.address, "===\n");

const sessionSignerKey = generatePrivateKey();
const sessionSigner = signerFromPrivateKey(sessionSignerKey);

console.log("=== grant_session (long-lived, persistent signer) ===");
const session = await client.grantSession({
  wallet,
  signer: adminSigner,
  sessionSigner,
  permissions: {
    calls: [{ to: USDT }, { to: VUSDT }],
    spend: [
      { limit: parseEther("0.05"), period: "day" },
      { limit: parseUnits("100", 6), period: "day", token: USDT },
    ],
  },
  expiry: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
});
console.log("Session publicKey:", session.publicKey);
console.log("Expiry:", new Date(session.expiry * 1000).toISOString(), "\n");

console.log("=== approveTokenForPermit2 (USDT -> Permit2, one-time) ===");
const r1 = await client.approveTokenForPermit2({ wallet, signer: adminSigner, token: USDT });
console.log("tx:", r1.status, r1.transactionHash, "\n");

console.log("=== approveSignatureChecker (Permit2 as valid ERC-1271 checker for this session) ===");
const r2 = await client.approveSignatureChecker({ wallet, signer: adminSigner, session, checker: PERMIT2_ADDRESS });
console.log("tx:", r2.status, r2.transactionHash, "\n");

appendFileSync(".env.local", `\nX402_SESSION_SIGNER_KEY=${sessionSignerKey}\n`);
console.log("Session signer key persisted to .env.local (X402_SESSION_SIGNER_KEY)");
console.log("\nDone. The /api/hire route can now sign x402 payments using this session.");
