import "dotenv/config";
import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";
import { createPublicClient, http, encodeFunctionData, parseUnits } from "viem";
import { readFileSync, writeFileSync } from "fs";

/**
 * Agente de yield: compara APR entre Venus / Aave V3 / Lista y suministra al
 * mejor disponible. Arquitectura para 3 protocolos; en BSC testnet (97) solo
 * Venus tiene deployment -- Aave y Lista quedan "configuradas, no disponibles
 * en esta red" (ver AGENT_LOG). Reactivar sus ramas en mainnet (56) cambiando
 * CHAIN_ID y las direcciones ya documentadas abajo.
 */

const CHAIN_ID = 97; // BSC Testnet. Cambiar a 56 para mainnet (activa Aave+Lista).

const USDT_ADDRESS = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c"; // testnet
const VUSDT_ADDRESS = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A"; // testnet

// Direcciones MAINNET, documentadas para cuando CHAIN_ID pase a 56.
const MAINNET = {
  aave: { pool: "0x6807dc923806fE8Fd134338EABCA509979a7e0cB" }, // Aave V3 BNB Pool
  lista: { manager: "0x1adB950d8bB3dA4bE104211D5AB038628e477fE6", slisBNB: "0xB0b84D294e0C75A6abe60171b70edEb2EFd14A1B" },
};

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

// --- Fuentes de yield: cada una sabe leer su tasa SI esta disponible en CHAIN_ID
async function rateVenus() {
  if (CHAIN_ID !== 97 && CHAIN_ID !== 56) return { available: false, reason: "chain no soportada" };
  const supplyRatePerBlock = await publicClient.readContract({
    address: VUSDT_ADDRESS, abi: vusdtAbi, functionName: "supplyRatePerBlock",
  });
  const blocksPerYear = 10_512_000n;
  const apy = (Number(supplyRatePerBlock) * Number(blocksPerYear)) / 1e18 * 100;
  return { available: true, apy, source: "venus" };
}

async function rateAave() {
  if (CHAIN_ID !== 56) {
    return { available: false, reason: `Aave V3 sin deployment en BSC testnet (chain ${CHAIN_ID}). Pool mainnet: ${MAINNET.aave.pool}` };
  }
  // En mainnet: leer getReserveData(USDT) del Pool y derivar currentLiquidityRate (ray, 1e27).
  // const data = await publicClient.readContract({address: MAINNET.aave.pool, abi: aavePoolAbi, functionName: "getReserveData", args: [USDT_MAINNET]});
  // return { available: true, apy: Number(data.currentLiquidityRate) / 1e27 * 100, source: "aave" };
  return { available: false, reason: "rama mainnet no implementada en este script (fuera de alcance testnet)" };
}

async function rateLista() {
  if (CHAIN_ID !== 56) {
    return { available: false, reason: `Lista sin deployment discoverable en BSC testnet (chain ${CHAIN_ID}). Manager mainnet: ${MAINNET.lista.manager}` };
  }
  // En mainnet: Lista no expone un view "APY" directo -- se deriva del crecimiento
  // historico de convertSnBnbToBnb() en dos timestamps, o de un endpoint off-chain.
  return { available: false, reason: "rama mainnet no implementada en este script (fuera de alcance testnet)" };
}

console.log(`=== Comparador de yield -- chain ${CHAIN_ID} ===\n`);

const [venus, aave, lista] = await Promise.all([rateVenus(), rateAave(), rateLista()]);
const sources = { venus, aave, lista };

for (const [name, r] of Object.entries(sources)) {
  if (r.available) console.log(`  ${name.padEnd(6)}: APY ${r.apy.toFixed(4)}%`);
  else console.log(`  ${name.padEnd(6)}: NO DISPONIBLE -- ${r.reason}`);
}

const candidates = Object.entries(sources).filter(([, r]) => r.available);
if (candidates.length === 0) throw new Error("Ninguna fuente de yield disponible en esta chain.");

candidates.sort((a, b) => b[1].apy - a[1].apy);
const [winnerName, winner] = candidates[0];
console.log(`\nGanador: ${winnerName} (${winner.apy.toFixed(4)}% APY, ${candidates.length}/3 fuentes disponibles en esta chain)\n`);

if (winnerName !== "venus") throw new Error(`Ejecucion solo implementada para venus en este script (ganador: ${winnerName})`);

// --- grant_session scoped a USDT+vUSDT (unica rama ejecutable en testnet) ---
console.log("=== grant_session (scope: USDT + vUSDT) ===");
const amount = parseUnits("50", 18); // monto distinto al del agente Venus anterior (100)

const session = await client.grantSession({
  wallet,
  signer: adminSigner,
  permissions: {
    calls: [{ to: USDT_ADDRESS }, { to: VUSDT_ADDRESS }],
    spend: [
      { limit: parseUnits("0.05", 18), period: "day" },
      { limit: parseUnits("50", 18), period: "day", token: USDT_ADDRESS },
    ],
  },
  expiry: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
});
console.log("Session:", session.publicKey.slice(0, 20) + "...");

writeFileSync("session-yield.json", JSON.stringify({ publicKey: session.publicKey, expiry: session.expiry, walletAddress: session.walletAddress }, null, 2));

// --- seed 50 USDT de test (via sesion, no raw tx) ---
console.log("\n=== Sembrando 50 USDT de test ===");
const allocateCall = {
  to: USDT_ADDRESS, value: 0n,
  data: encodeFunctionData({ abi: usdtAbi, functionName: "allocateTo", args: [wallet.address, amount] }),
};
const seedResult = await client.execute({ session, calls: [allocateCall] });
console.log("Seed tx:", seedResult.status, seedResult.transactionHash);

// --- ejecutar supply en el ganador (venus) ---
console.log("\n=== Supply en Venus (decision del comparador) ===");
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

// --- position-check ---
console.log("\n=== position-check ===");
const vUsdtBalance = await publicClient.readContract({ address: VUSDT_ADDRESS, abi: vusdtAbi, functionName: "balanceOf", args: [wallet.address] });
const exchangeRate = await publicClient.readContract({ address: VUSDT_ADDRESS, abi: vusdtAbi, functionName: "exchangeRateStored" });
const underlyingValue = (BigInt(vUsdtBalance) * BigInt(exchangeRate)) / (10n ** 18n);
console.log("Posicion total en Venus (underlying USDT):", (Number(underlyingValue) / 1e18).toFixed(6));
console.log("\nWallet:", wallet.address);
console.log("Explorer:", `https://testnet.bscscan.com/address/${wallet.address}`);
