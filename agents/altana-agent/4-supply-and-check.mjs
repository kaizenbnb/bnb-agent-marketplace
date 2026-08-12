import "dotenv/config";
import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";
import { createPublicClient, http, encodeFunctionData, parseUnits } from "viem";
import { readFileSync, writeFileSync } from "fs";

const USDT_ADDRESS = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c";
const VUSDT_ADDRESS = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";

const usdtAbi = JSON.parse(readFileSync("./usdt-abi.json", "utf-8"));
const vusdtAbi = JSON.parse(readFileSync("./vusdt-abi.json", "utf-8"));

const wallet = { address: process.env.WALLET_ADDRESS };
const adminSigner = signerFromPrivateKey(process.env.ADMIN_PRIVATE_KEY);
const client = createClient({ chains: [BNB_TESTNET] });

const bscTestnetRO = {
  id: 97, name: "BSC Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: ["https://bsc-testnet-rpc.publicnode.com"] } },
};
const publicClient = createPublicClient({ chain: bscTestnetRO, transport: http() });

const amount = parseUnits("100", 18);

// --- Paso 4 (retry): grant_session con SpendPermission de USDT -------------
console.log("=== Paso 4 (retry): grant_session con cap USDT ===");
console.log("Fallo anterior: NoSpendPermissions -- approve()/mint() sobre un token requieren");
console.log("un SpendPermission con 'token' explicito, no solo el cap nativo.\n");

const session = await client.grantSession({
  wallet,
  signer: adminSigner,
  permissions: {
    calls: [{ to: USDT_ADDRESS }, { to: VUSDT_ADDRESS }],
    spend: [
      { limit: parseUnits("0.05", 18), period: "day" },           // nativo (gas buffer formal)
      { limit: parseUnits("100", 18), period: "day", token: USDT_ADDRESS }, // cap real: 100 USDT/dia
    ],
  },
  expiry: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
});
console.log("Session publicKey:", session.publicKey, "| expira:", new Date(session.expiry * 1000).toISOString());

writeFileSync(
  "session.json",
  JSON.stringify({ publicKey: session.publicKey, expiry: session.expiry, walletAddress: session.walletAddress }, null, 2)
);

// --- Paso 5: play 'supply' --------------------------------------------------
console.log("\n=== Paso 5: play 'supply' (100 USDT en Venus) ===");
const approveCall = {
  to: USDT_ADDRESS, value: 0n,
  data: encodeFunctionData({ abi: usdtAbi, functionName: "approve", args: [VUSDT_ADDRESS, amount] }),
};
const mintCall = {
  to: VUSDT_ADDRESS, value: 0n,
  data: encodeFunctionData({ abi: vusdtAbi, functionName: "mint", args: [amount] }),
};
const supplyResult = await client.execute({ session, calls: [approveCall, mintCall] });
console.log("Supply tx:", supplyResult.status, supplyResult.transactionHash);

// --- Paso 6: position-check --------------------------------------------------
console.log("\n=== Paso 6: position-check ===");
const vUsdtBalance = await publicClient.readContract({
  address: VUSDT_ADDRESS, abi: vusdtAbi, functionName: "balanceOf", args: [wallet.address],
});
const exchangeRate = await publicClient.readContract({
  address: VUSDT_ADDRESS, abi: vusdtAbi, functionName: "exchangeRateStored",
});
const supplyRatePerBlock = await publicClient.readContract({
  address: VUSDT_ADDRESS, abi: vusdtAbi, functionName: "supplyRatePerBlock",
});
const usdtBalanceAfter = await publicClient.readContract({
  address: USDT_ADDRESS, abi: usdtAbi, functionName: "balanceOf", args: [wallet.address],
});

const underlyingValue = (BigInt(vUsdtBalance) * BigInt(exchangeRate)) / (10n ** 18n);
const blocksPerYear = 10_512_000n;
const apyApprox = (Number(supplyRatePerBlock) * Number(blocksPerYear)) / 1e18 * 100;

console.log("vUSDT balance:", (Number(vUsdtBalance) / 1e8).toFixed(6));
console.log("USDT restante en wallet:", (Number(usdtBalanceAfter) / 1e18).toFixed(2));
console.log("Posicion (underlying USDT):", (Number(underlyingValue) / 1e18).toFixed(6));
console.log("APY aproximado:", apyApprox.toFixed(4), "%");
console.log("\nWallet:", wallet.address);
console.log("Explorer:", `https://testnet.bscscan.com/address/${wallet.address}`);
