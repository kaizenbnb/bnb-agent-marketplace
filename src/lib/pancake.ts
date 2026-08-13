import { createPublicClient, encodeFunctionData, http, parseEther, type Address, type Hex } from "viem";
import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";

const bscTestnetRO = {
  id: 97, name: "BSC Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: ["https://bsc-testnet-rpc.publicnode.com"] } },
} as const;
const publicClient = createPublicClient({ chain: bscTestnetRO, transport: http() });

export const V2_ROUTER: Address = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
export const WBNB_TESTNET: Address = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
export const BUSD_TESTNET: Address = "0x78867BbEeF44f2326bF8DDd1941a4439382EF2A7";

export const routerAbi = [
  { type: "function", name: "getAmountsOut", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address[]" }], outputs: [{ type: "uint256[]" }] },
  { type: "function", name: "swapExactETHForTokens", stateMutability: "payable", inputs: [{ type: "uint256" }, { type: "address[]" }, { type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256[]" }] },
] as const;

/**
 * The grid agent's real, billable action: fire one grid-style swap on the
 * WBNB/BUSD V2 pair -- same pair and direction as the original kick-off
 * (10-grid-trading-agent.mjs / 11-grid-trading-agent-v2.mjs), since a hire
 * needs a deterministic, always-executable action rather than depending on
 * whether the price happens to have crossed a threshold at request time.
 *
 * `beneficiary`: the buyer-chosen wallet from the hire request, logged for
 * the audit trail. Not yet routed into the trade itself -- all 4 agents
 * still share one wallet and one grid position today (see README).
 */
export async function fireGridSwap(beneficiary: Address, amountBnb = parseEther("0.01")): Promise<Hex> {
  console.log(`[fireGridSwap] hired on behalf of ${beneficiary}`);
  const wallet = { address: process.env.WALLET_ADDRESS as Address };
  const adminSigner = signerFromPrivateKey(process.env.ADMIN_PRIVATE_KEY as Hex);
  const client = createClient({ chains: [BNB_TESTNET] });

  const amounts = await publicClient.readContract({
    address: V2_ROUTER, abi: routerAbi, functionName: "getAmountsOut",
    args: [amountBnb, [WBNB_TESTNET, BUSD_TESTNET]],
  });
  const amountOutMin = (amounts[1] * 97n) / 100n; // 3% slippage

  const session = await client.grantSession({
    wallet,
    signer: adminSigner,
    permissions: {
      calls: [{ to: V2_ROUTER }],
      spend: [{ limit: amountBnb + parseEther("0.01"), period: "day" }],
    },
    expiry: Math.floor(Date.now() / 1000) + 3600,
  });

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const swapCall = {
    to: V2_ROUTER, value: amountBnb,
    data: encodeFunctionData({
      abi: routerAbi, functionName: "swapExactETHForTokens",
      args: [amountOutMin, [WBNB_TESTNET, BUSD_TESTNET], wallet.address, deadline],
    }),
  };

  const result = await client.execute({ session, calls: [swapCall] });
  if (!result.transactionHash) throw new Error("fireGridSwap: execute() returned no transaction hash");
  return result.transactionHash;
}
