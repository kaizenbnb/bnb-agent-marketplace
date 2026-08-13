import type { Address } from "viem";

/**
 * Permit2's EIP-712 domain and PermitTransferFrom/TokenPermissions type
 * strings, verified verbatim against Uniswap/permit2's EIP712.sol and
 * PermitHash.sol (no `version` field in the domain -- that's not a typo).
 * Round-trip signed/recovered with viem before wiring into the UI.
 *
 * Single source of truth: both the client (signs with the connected
 * wallet via wagmi's useSignTypedData) and the server (recovers the
 * signer to validate) import this same object, so the two sides can't
 * silently drift into an incompatible shape.
 */
export const PERMIT2_TYPES = {
  PermitTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
} as const;

export function permit2Domain(chainId: number, verifyingContract: Address) {
  return {
    name: "Permit2",
    chainId,
    verifyingContract,
  } as const;
}
