/**
 * Central check for required runtime environment variables. Used by /api/hire
 * (to fail with a clean 503 instead of an uncaught 500) and /api/health
 * (to report readiness without ever exposing the actual values).
 *
 * sessionSignerKey (X402_SESSION_SIGNER_KEY) is reported for visibility but
 * no longer required: it was only used for server-side Permit2 signing,
 * which the WalletConnect integration replaced with client-side signing by
 * the buyer's own connected wallet.
 */
export type ConfigStatus = {
  walletAddress: boolean;
  adminPrivateKey: boolean;
  sessionSignerKey: boolean;
};

export function getConfigStatus(): ConfigStatus {
  return {
    walletAddress: Boolean(process.env.WALLET_ADDRESS),
    adminPrivateKey: Boolean(process.env.ADMIN_PRIVATE_KEY),
    sessionSignerKey: Boolean(process.env.X402_SESSION_SIGNER_KEY),
  };
}

export function isConfigComplete(status: ConfigStatus = getConfigStatus()): boolean {
  return status.walletAddress && status.adminPrivateKey;
}
