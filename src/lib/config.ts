/**
 * Central check for required runtime environment variables. Used by /api/hire
 * (to fail with a clean 503 instead of an uncaught 500) and /api/health
 * (to report readiness without ever exposing the actual values).
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
  return status.walletAddress && status.adminPrivateKey && status.sessionSignerKey;
}
