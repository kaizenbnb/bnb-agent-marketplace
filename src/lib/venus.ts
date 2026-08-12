import { createPublicClient, http, encodeFunctionData, type Address, type Hex } from "viem";
import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";

export const USDT_TESTNET: Address = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c";
export const VUSDT_TESTNET: Address = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";

export const usdtAbi = [
  { type: "function", name: "allocateTo", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export const vusdtAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "supplyRatePerBlock", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOfUnderlying", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const bscTestnetRO = {
  id: 97,
  name: "BSC Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: ["https://bsc-testnet-rpc.publicnode.com"] } },
} as const;

export const publicClient = createPublicClient({ chain: bscTestnetRO, transport: http() });

/**
 * The yield agent's real decision: read Venus's rate (the only protocol of
 * the 3 evaluated that has a testnet deployment, per AGENT_LOG.md), confirm
 * it wins by default. Mirrors 5-yield-agent.mjs from the altana-agent scripts.
 */
export async function readVenusApy(): Promise<number> {
  const supplyRatePerBlock = await publicClient.readContract({
    address: VUSDT_TESTNET,
    abi: vusdtAbi,
    functionName: "supplyRatePerBlock",
  });
  const blocksPerYear = 10_512_000n;
  return (Number(supplyRatePerBlock) * Number(blocksPerYear)) / 1e18 * 100;
}

/**
 * The yield agent's real, billable action: mint a small amount of test USDT
 * and supply it to Venus. Runs via the admin path (not a scoped session) --
 * simpler and avoids the NoSpendPermissions quirks documented in AGENT_LOG.md
 * for redeem()/repayBorrow(); mint()/approve() work fine either way, and this
 * server route already holds the admin key, so there's no session to scope.
 * Returns the tx hash so the API route can report it as the "work" receipt.
 */
export async function supplyToVenus(amountUsdt = 1_000_000n): Promise<Hex> {
  const wallet = { address: process.env.WALLET_ADDRESS as Address };
  const adminSigner = signerFromPrivateKey(process.env.ADMIN_PRIVATE_KEY as Hex);
  const client = createClient({ chains: [BNB_TESTNET] });

  const allocateCall = {
    to: USDT_TESTNET, value: 0n,
    data: encodeFunctionData({ abi: usdtAbi, functionName: "allocateTo", args: [wallet.address, amountUsdt] }),
  };
  const approveCall = {
    to: USDT_TESTNET, value: 0n,
    data: encodeFunctionData({ abi: usdtAbi, functionName: "approve", args: [VUSDT_TESTNET, amountUsdt] }),
  };
  const mintCall = {
    to: VUSDT_TESTNET, value: 0n,
    data: encodeFunctionData({ abi: vusdtAbi, functionName: "mint", args: [amountUsdt] }),
  };

  const result = await client.execute({ wallet, signer: adminSigner, calls: [allocateCall, approveCall, mintCall] });
  if (!result.transactionHash) throw new Error("supplyToVenus: execute() returned no transaction hash");
  return result.transactionHash;
}
