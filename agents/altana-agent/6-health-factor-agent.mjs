import "dotenv/config";
import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";
import { createPublicClient, http, encodeFunctionData, parseUnits, parseEther } from "viem";
import { readFileSync, writeFileSync } from "fs";

/**
 * Agente de health factor sobre Venus (testnet). borrow/repay no estan en la
 * skill oficial de Venus Lending (solo-supply) -- se componen a mano contra
 * el Comptroller (Unitroller) y las funciones borrow/repayBorrow de vUSDT,
 * ambas confirmadas en deployments/bsctestnet.json de Venus.
 *
 * Flujo: supply BNB como colateral -> enterMarkets -> borrow USDT agresivo
 * (90% de la capacidad) para generar riesgo real -> leer health factor ->
 * si esta por debajo del umbral, repago parcial como accion protectora.
 */

const UNITROLLER = "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D";
const VBNB = "0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c";
const VUSDT = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";
const USDT = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c";

const comptrollerAbi = JSON.parse(readFileSync("./comptroller-abi.json", "utf-8"));
const oracleAbi = JSON.parse(readFileSync("./oracle-abi.json", "utf-8"));
const vbnbAbi = JSON.parse(readFileSync("./vbnb-abi.json", "utf-8"));
const vusdtAbi = JSON.parse(readFileSync("./vusdt-abi.json", "utf-8"));
const usdtAbi = JSON.parse(readFileSync("./usdt-abi.json", "utf-8"));

const wallet = { address: process.env.WALLET_ADDRESS };
const adminSigner = signerFromPrivateKey(process.env.ADMIN_PRIVATE_KEY);
const client = createClient({ chains: [BNB_TESTNET] });

const bscTestnetRO = {
  id: 97, name: "BSC Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: ["https://bsc-testnet-rpc.publicnode.com"] } },
};
const pub = createPublicClient({ chain: bscTestnetRO, transport: http() });

const HF_THRESHOLD = 1.15;
const COLLATERAL_BNB = parseEther("0.05");

async function readHealthFactor() {
  const [, liquidity, shortfall] = await pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "getAccountLiquidity", args: [wallet.address] });
  const borrowBalance = await pub.readContract({ address: VUSDT, abi: vusdtAbi, functionName: "borrowBalanceStored", args: [wallet.address] });
  const oracleAddr = await pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "oracle" });
  const priceUSDT = await pub.readContract({ address: oracleAddr, abi: oracleAbi, functionName: "getUnderlyingPrice", args: [VUSDT] });

  if (borrowBalance === 0n) return { hf: Infinity, liquidity, shortfall, borrowBalance, debtValue: 0n };

  const debtValue = (borrowBalance * priceUSDT) / (10n ** 18n); // valor de la deuda en unidades normalizadas del oraculo
  const collateralAdjustedValue = shortfall > 0n ? debtValue - shortfall : debtValue + liquidity;
  const hf = Number(collateralAdjustedValue) / Number(debtValue);
  return { hf, liquidity, shortfall, borrowBalance, debtValue, oracleAddr, priceUSDT };
}

console.log("=== Agente Health Factor -- Venus (BSC testnet) ===\n");

// --- grant_session: scope ampliado a Comptroller + vBNB + vUSDT + USDT ----
console.log("=== grant_session ===");
const session = await client.grantSession({
  wallet,
  signer: adminSigner,
  permissions: {
    calls: [{ to: UNITROLLER }, { to: VBNB }, { to: VUSDT }, { to: USDT }],
    spend: [
      { limit: parseEther("0.1"), period: "day" }, // nativo: cubre el mint de vBNB (0.05) + buffer
      { limit: parseUnits("50", 18), period: "day", token: USDT }, // cap para el approve+repay
    ],
  },
  expiry: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
});
console.log("Session:", session.publicKey.slice(0, 20) + "...\n");
writeFileSync("session-healthfactor.json", JSON.stringify({ publicKey: session.publicKey, expiry: session.expiry, walletAddress: session.walletAddress }, null, 2));

// --- Paso 1: supply BNB como colateral + enterMarkets -----------------------
console.log("=== Paso 1: supply 0.05 tBNB como colateral + enterMarkets ===");
const mintCall = { to: VBNB, value: COLLATERAL_BNB, data: encodeFunctionData({ abi: vbnbAbi, functionName: "mint", args: [] }) };
const enterMarketsCall = { to: UNITROLLER, value: 0n, data: encodeFunctionData({ abi: comptrollerAbi, functionName: "enterMarkets", args: [[VBNB]] }) };
const r1 = await client.execute({ session, calls: [mintCall, enterMarketsCall] });
console.log("tx:", r1.status, r1.transactionHash, "\n");

// --- Paso 2: calcular borrow agresivo (90% de la capacidad real) -----------
console.log("=== Paso 2: dimensionar borrow desde getAccountLiquidity real ===");
const [, liquidityAfterCollateral] = await pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "getAccountLiquidity", args: [wallet.address] });
const oracleAddr = await pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "oracle" });
const priceUSDT = await pub.readContract({ address: oracleAddr, abi: oracleAbi, functionName: "getUnderlyingPrice", args: [VUSDT] });
console.log("Liquidez disponible (unidades del oraculo):", liquidityAfterCollateral.toString());

const borrowAmount = (liquidityAfterCollateral * (10n ** 18n) / priceUSDT) * 90n / 100n; // 90% del maximo
console.log("Borrow calculado (90% del maximo):", (Number(borrowAmount) / 1e18).toFixed(6), "USDT\n");

console.log("=== Paso 3: borrow() ===");
const borrowCall = { to: VUSDT, value: 0n, data: encodeFunctionData({ abi: vusdtAbi, functionName: "borrow", args: [borrowAmount] }) };
const r2 = await client.execute({ session, calls: [borrowCall] });
console.log("tx:", r2.status, r2.transactionHash, "\n");

// --- Paso 4: leer health factor real ----------------------------------------
console.log("=== Paso 4: health factor tras el borrow ===");
const status1 = await readHealthFactor();
console.log(`HF = ${status1.hf.toFixed(4)}  (deuda: ${(Number(status1.borrowBalance)/1e18).toFixed(4)} USDT, umbral: ${HF_THRESHOLD})`);

// --- Paso 5: accion protectora si procede -----------------------------------
if (status1.hf < HF_THRESHOLD) {
  console.log(`\nHF ${status1.hf.toFixed(4)} < umbral ${HF_THRESHOLD} -> repago parcial (30% de la deuda)`);
  const repayAmount = status1.borrowBalance * 30n / 100n;
  const approveCall = { to: USDT, value: 0n, data: encodeFunctionData({ abi: usdtAbi, functionName: "approve", args: [VUSDT, repayAmount] }) };
  const repayCall = { to: VUSDT, value: 0n, data: encodeFunctionData({ abi: vusdtAbi, functionName: "repayBorrow", args: [repayAmount] }) };
  const r3 = await client.execute({ session, calls: [approveCall, repayCall] });
  console.log("tx repay:", r3.status, r3.transactionHash);

  const status2 = await readHealthFactor();
  console.log(`\nHF tras repago: ${status2.hf.toFixed(4)}  (deuda: ${(Number(status2.borrowBalance)/1e18).toFixed(4)} USDT)`);
  console.log(status2.hf > status1.hf ? "Mejora confirmada." : "AVISO: el HF no mejoro como se esperaba.");
} else {
  console.log(`\nHF ${status1.hf.toFixed(4)} >= umbral ${HF_THRESHOLD} -> posicion sana, sin accion.`);
}

console.log("\nWallet:", wallet.address);
console.log("Explorer:", `https://testnet.bscscan.com/address/${wallet.address}`);
