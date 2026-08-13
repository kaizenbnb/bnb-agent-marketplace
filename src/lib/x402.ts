import { createWalletClient, createPublicClient, http, recoverTypedDataAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PERMIT2_ADDRESS } from "@altananetwork/sdk";
import { USDT_TESTNET } from "./venus";
import { PERMIT2_TYPES, permit2Domain } from "./permit2-types";

export { PERMIT2_ADDRESS };

const HIRE_PRICE_USDT = 1_000_000n; // 1.00 USDT, 6 decimals -- the ONLY price the server will ever quote or accept
const BSC_TESTNET_CHAIN_ID = 97;

const bscTestnetRO = {
  id: 97,
  name: "BSC Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: ["https://bsc-testnet-rpc.publicnode.com"] } },
} as const;

/**
 * Build the x402 402 response body. Scheme "permit2" (plain PermitTransferFrom,
 * not the witness-binding "permit2-exact" B402 uses). That variant relies on
 * Binance's own x402ExactPermit2Proxy contract, which only exists on mainnet.
 * Plain Permit2 is deployed at the same canonical address on every chain
 * including testnet, so this settles with zero extra infrastructure.
 */
export function build402Body(
  agentWallet: Address,
  resourceUrl: string,
  description: string
) {
  return {
    x402Version: 1,
    resource: { url: resourceUrl, description },
    accepts: [
      {
        scheme: "permit2",
        network: "bsc-testnet",
        asset: USDT_TESTNET,
        maxAmountRequired: HIRE_PRICE_USDT.toString(),
        payTo: agentWallet,
        maxTimeoutSeconds: 3600,
        extra: {
          spenderAddress: process.env.WALLET_ADDRESS, // our relayer settles; see AGENT_LOG for the self-funded-demo caveat
          name: "USDT",
        },
      },
    ],
  };
}

export const permit2Abi = [
  {
    type: "function",
    name: "permitTransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "permit",
        type: "tuple",
        components: [
          { name: "permitted", type: "tuple", components: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }] },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      {
        name: "transferDetails",
        type: "tuple",
        components: [{ name: "to", type: "address" }, { name: "requestedAmount", type: "uint256" }],
      },
      { name: "owner", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "nonceBitmap",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "wordPos", type: "uint256" }],
    outputs: [{ name: "bitmap", type: "uint256" }],
  },
] as const;

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "balance", type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "remaining", type: "uint256" }] },
] as const;

export type XPaymentPayload = {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: Hex;
    from: Address;
    permit: { permitted: { token: Address; amount: string }; spender: Address; nonce: string; deadline: string };
  };
};

export function decodeXPayment(header: string): XPaymentPayload {
  const json = Buffer.from(header, "base64").toString("utf-8");
  return JSON.parse(json);
}

/**
 * Settle a decoded X-PAYMENT permit2 authorization on-chain by calling
 * Permit2.permitTransferFrom directly with our relayer key. Any address may
 * relay a validly-signed Permit2 authorization. Settlement doesn't require
 * the payer's key, only a valid signature already produced by them.
 */
/**
 * Validate a decoded X-PAYMENT permit2 authorization WITHOUT writing to the blockchain.
 * Reads: signature recovery, nonceBitmap (to confirm nonce is unused), balanceOf, allowance.
 * Returns true if all checks pass; throws on any validation failure.
 *
 * `expectedAmount` is what the server itself quoted in the 402 response (from
 * the request body's `amount` field) -- checked against what's actually
 * cryptographically committed inside the signed permit, so a client can't
 * silently sign one number while telling the UI a different one.
 */
export async function validatePermit2Authorization(
  payload: XPaymentPayload,
  expectedAmount: bigint
): Promise<boolean> {
  const publicClient = createPublicClient({ chain: bscTestnetRO, transport: http() });
  const { permit, from, signature } = payload.payload;
  const permitAmount = BigInt(permit.permitted.amount);
  const deadline = BigInt(permit.deadline);
  const token = permit.permitted.token as Address;

  // Check 0: signature was actually produced by the claimed owner (`from`).
  // This is the check that matters most now that a real, potentially
  // adversarial user wallet signs client-side instead of our own server key.
  const recovered = await recoverTypedDataAddress({
    domain: permit2Domain(BSC_TESTNET_CHAIN_ID, PERMIT2_ADDRESS as Address),
    types: PERMIT2_TYPES,
    primaryType: "PermitTransferFrom",
    message: {
      permitted: { token, amount: permitAmount },
      spender: permit.spender,
      nonce: BigInt(permit.nonce),
      deadline,
    },
    signature,
  });
  if (recovered.toLowerCase() !== from.toLowerCase()) {
    throw new Error(`Signature does not match claimed owner: recovered ${recovered}, expected ${from}`);
  }

  // Check 0b: the signed spender must be OUR relayer -- Permit2 binds
  // "spender" to whoever calls permitTransferFrom on-chain (msg.sender), so
  // a signature made out to any other spender will never settle through us.
  if (permit.spender.toLowerCase() !== (process.env.WALLET_ADDRESS ?? "").toLowerCase()) {
    throw new Error(`Signed spender ${permit.spender} does not match relayer ${process.env.WALLET_ADDRESS}`);
  }

  // Check 0c: token and amount must match what the server actually quoted.
  if (token.toLowerCase() !== USDT_TESTNET.toLowerCase()) {
    throw new Error(`Unexpected token: ${token}`);
  }
  if (permitAmount !== expectedAmount) {
    throw new Error(`Signed amount ${permitAmount} does not match quoted amount ${expectedAmount}`);
  }

  // Check 1: deadline has not passed
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (deadline < now) {
    throw new Error(`Permit deadline ${deadline} has passed (now: ${now})`);
  }

  // Check 2: nonce is still available (not yet used)
  const nonceValue = BigInt(permit.nonce);
  const wordPos = nonceValue >> 8n; // nonce / 256
  const bitPos = Number(nonceValue & 0xFFn); // nonce % 256
  const bitmap = await publicClient.readContract({
    address: PERMIT2_ADDRESS as Address,
    abi: permit2Abi,
    functionName: "nonceBitmap",
    args: [from, wordPos],
  });
  const isBitSet = Boolean((bitmap >> BigInt(bitPos)) & 1n);
  if (isBitSet) {
    throw new Error(`Nonce ${permit.nonce} already used (bitmap word ${wordPos}, bit ${bitPos})`);
  }

  // Check 3: owner has sufficient balance
  const balance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [from],
  });
  if (balance < permitAmount) {
    throw new Error(`Insufficient balance: ${balance} < ${permitAmount} required`);
  }

  // Check 4: owner has approved Permit2 for at least the requested amount
  const allowance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [from, PERMIT2_ADDRESS as Address],
  });
  if (allowance < permitAmount) {
    throw new Error(`Insufficient allowance: ${allowance} < ${permitAmount} required`);
  }

  return true;
}

export async function settlePermit2Payment(payload: XPaymentPayload, recipient: Address) {
  const account = privateKeyToAccount(process.env.ADMIN_PRIVATE_KEY as Hex);
  const walletClient = createWalletClient({ account, chain: bscTestnetRO, transport: http() });
  const publicClient = createPublicClient({ chain: bscTestnetRO, transport: http() });

  const { permit, signature, from } = payload.payload;

  const hash = await walletClient.writeContract({
    address: PERMIT2_ADDRESS as Address,
    abi: permit2Abi,
    functionName: "permitTransferFrom",
    args: [
      {
        permitted: { token: permit.permitted.token, amount: BigInt(permit.permitted.amount) },
        nonce: BigInt(permit.nonce),
        deadline: BigInt(permit.deadline),
      },
      { to: recipient, requestedAmount: BigInt(permit.permitted.amount) },
      from,
      signature,
    ],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export { HIRE_PRICE_USDT };
