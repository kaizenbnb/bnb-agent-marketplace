import { createPublicClient, http, encodeFunctionData, parseEther, type Address, type Hex } from "viem";
import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";

export const USDT_TESTNET: Address = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c";
export const VUSDT_TESTNET: Address = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";
export const VBNB_TESTNET: Address = "0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c";

export const vbnbAbi = [
  { type: "function", name: "mint", stateMutability: "payable", inputs: [], outputs: [] },
] as const;

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
 *
 * `beneficiary` is the buyer-chosen wallet from the hire request -- logged
 * for the audit trail. Not yet routed into the position itself: all 4
 * agents still share one wallet and one Venus position today (see README),
 * so there's no per-buyer position to credit it to.
 */
export async function supplyToVenus(beneficiary: Address, amountUsdt = 1_000_000n): Promise<Hex> {
  console.log(`[supplyToVenus] hired on behalf of ${beneficiary}`);
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

/**
 * The health-factor agent's real, billable action: add collateral. Uses
 * vBNB.mint() (payable), deliberately NOT repayBorrow() -- repayBorrow()/
 * redeem() are confirmed unsupported through a scoped session in
 * @altananetwork/sdk@0.7.0 (NoSpendPermissions regardless of the declared
 * permission, see AGENT_LOG.md); mint() works fine via session, unlike the
 * yield action this one deliberately goes through a freshly-granted scoped
 * session rather than the admin path, to demonstrate the working case.
 *
 * `beneficiary`: see supplyToVenus's docstring -- same caveat applies here.
 */
export async function addCollateralToVenus(beneficiary: Address, amountBnb = parseEther("0.01")): Promise<Hex> {
  console.log(`[addCollateralToVenus] hired on behalf of ${beneficiary}`);
  const wallet = { address: process.env.WALLET_ADDRESS as Address };
  const adminSigner = signerFromPrivateKey(process.env.ADMIN_PRIVATE_KEY as Hex);
  const client = createClient({ chains: [BNB_TESTNET] });

  const session = await client.grantSession({
    wallet,
    signer: adminSigner,
    permissions: {
      calls: [{ to: VBNB_TESTNET }],
      spend: [{ limit: amountBnb + parseEther("0.01"), period: "day" }],
    },
    expiry: Math.floor(Date.now() / 1000) + 3600,
  });

  const mintCall = {
    to: VBNB_TESTNET, value: amountBnb,
    data: encodeFunctionData({ abi: vbnbAbi, functionName: "mint", args: [] }),
  };

  const result = await client.execute({ session, calls: [mintCall] });
  if (!result.transactionHash) throw new Error("addCollateralToVenus: execute() returned no transaction hash");
  return result.transactionHash;
}
