import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";
import { createPublicClient, encodeFunctionData, http, parseEther, type Address, type Hex } from "viem";
import { V2_ROUTER, WBNB_TESTNET, routerAbi } from "./pancake";

export const V3_NPM: Address = "0x427bF5b37357632377eCbEC9de3626C71A5396c1"; // testnet, distinct from mainnet
export const USDT_OFFICIAL: Address = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";

// Position B, minted by the original rebalancing agent (12-rebalancing-agent-v3.mjs).
// token0 = USDT_OFFICIAL, token1 = WBNB_TESTNET (confirmed by address ordering then).
const POSITION_B_TOKEN_ID = 36782n;

const wethAbi = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const npmAbi = [
  {
    type: "function", name: "increaseLiquidity", stateMutability: "payable",
    inputs: [{
      name: "params", type: "tuple",
      components: [
        { name: "tokenId", type: "uint256" },
        { name: "amount0Desired", type: "uint256" },
        { name: "amount1Desired", type: "uint256" },
        { name: "amount0Min", type: "uint256" },
        { name: "amount1Min", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    }],
    outputs: [{ name: "liquidity", type: "uint128" }, { name: "amount0", type: "uint256" }, { name: "amount1", type: "uint256" }],
  },
] as const;

const bscTestnetRO = {
  id: 97, name: "BSC Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: ["https://bsc-testnet-rpc.publicnode.com"] } },
} as const;
const publicClient = createPublicClient({ chain: bscTestnetRO, transport: http() });

/**
 * The rebalancing agent's real, billable action: grow the existing V3
 * position (tokenId 36782, minted by 12-rebalancing-agent-v3.mjs) with fresh
 * capital via NonfungiblePositionManager.increaseLiquidity(). Reuses the same
 * V2-swap-for-USDT + wrap-for-WBNB pattern the original agent used to fund
 * its mint, since neither token sits idle in the wallet by default.
 */
export async function growPositionB(swapAmountBnb = parseEther("0.01"), wrapAmountBnb = parseEther("0.01")): Promise<Hex> {
  const wallet = { address: process.env.WALLET_ADDRESS as Address };
  const adminSigner = signerFromPrivateKey(process.env.ADMIN_PRIVATE_KEY as Hex);
  const client = createClient({ chains: [BNB_TESTNET] });

  const session = await client.grantSession({
    wallet,
    signer: adminSigner,
    permissions: {
      calls: [{ to: V2_ROUTER }, { to: WBNB_TESTNET }, { to: USDT_OFFICIAL }, { to: V3_NPM }],
      spend: [
        { limit: swapAmountBnb + wrapAmountBnb + parseEther("0.01"), period: "day" },
        { limit: 50_000_000_000_000_000_000n, period: "day", token: USDT_OFFICIAL }, // 50 USDT-official (18 dec)
        { limit: parseEther("1"), period: "day", token: WBNB_TESTNET },
      ],
    },
    expiry: Math.floor(Date.now() / 1000) + 3600,
  });

  // Step 1: swap tBNB -> USDT-official (need the second asset; nothing idle in the wallet).
  const quote = await publicClient.readContract({
    address: V2_ROUTER, abi: routerAbi, functionName: "getAmountsOut",
    args: [swapAmountBnb, [WBNB_TESTNET, USDT_OFFICIAL]],
  });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const swapCall = {
    to: V2_ROUTER, value: swapAmountBnb,
    data: encodeFunctionData({
      abi: routerAbi, functionName: "swapExactETHForTokens",
      args: [(quote[1] * 97n) / 100n, [WBNB_TESTNET, USDT_OFFICIAL], wallet.address, deadline],
    }),
  };
  await client.execute({ session, calls: [swapCall] });

  const usdtBalance = await publicClient.readContract({ address: USDT_OFFICIAL, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });

  // Step 2: wrap tBNB -> WBNB (the position's other asset).
  const wrapCall = { to: WBNB_TESTNET, value: wrapAmountBnb, data: encodeFunctionData({ abi: wethAbi, functionName: "deposit", args: [] }) };
  await client.execute({ session, calls: [wrapCall] });

  const wbnbBalance = await publicClient.readContract({ address: WBNB_TESTNET, abi: wethAbi, functionName: "balanceOf", args: [wallet.address] });

  // Step 3: approve both + increaseLiquidity on the existing position.
  const approve0 = { to: USDT_OFFICIAL, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [V3_NPM, usdtBalance] }) };
  const approve1 = { to: WBNB_TESTNET, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [V3_NPM, wbnbBalance] }) };
  const increaseCall = {
    to: V3_NPM, value: 0n,
    data: encodeFunctionData({
      abi: npmAbi, functionName: "increaseLiquidity",
      args: [{
        tokenId: POSITION_B_TOKEN_ID,
        amount0Desired: usdtBalance,
        amount1Desired: wbnbBalance,
        amount0Min: 0n,
        amount1Min: 0n,
        deadline,
      }],
    }),
  };

  const result = await client.execute({ session, calls: [approve0, approve1, increaseCall] });
  if (!result.transactionHash) throw new Error("growPositionB: execute() returned no transaction hash");
  return result.transactionHash;
}

/**
 * Alternative rebalancing action: collect accumulated fees from position B instead of growing it.
 * Demonstrates a different rebalancing strategy: harvest profits rather than add capital.
 */
export async function collectFeesPositionB(): Promise<Hex> {
  const wallet = { address: process.env.WALLET_ADDRESS as Address };
  const adminSigner = signerFromPrivateKey(process.env.ADMIN_PRIVATE_KEY as Hex);
  const client = createClient({ chains: [BNB_TESTNET] });

  const session = await client.grantSession({
    wallet,
    signer: adminSigner,
    permissions: {
      calls: [{ to: V3_NPM }],
      spend: [{ limit: parseEther("0.01"), period: "day" }],
    },
    expiry: Math.floor(Date.now() / 1000) + 3600,
  });

  const collectAbi = [
    {
      type: "function", name: "collect", stateMutability: "payable",
      inputs: [{
        name: "params", type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "amount0Max", type: "uint128" },
          { name: "amount1Max", type: "uint128" },
        ],
      }],
      outputs: [{ name: "amount0", type: "uint256" }, { name: "amount1", type: "uint256" }],
    },
  ] as const;

  const collectCall = {
    to: V3_NPM, value: 0n,
    data: encodeFunctionData({
      abi: collectAbi, functionName: "collect",
      args: [{
        tokenId: POSITION_B_TOKEN_ID,
        recipient: wallet.address,
        amount0Max: 340282366920938463463374607431768211455n, // uint128 max
        amount1Max: 340282366920938463463374607431768211455n,
      }],
    }),
  };

  const result = await client.execute({ session, calls: [collectCall] });
  if (!result.transactionHash) throw new Error("collectFeesPositionB: execute() returned no transaction hash");
  return result.transactionHash;
}
