import "dotenv/config";
import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";
import { createPublicClient, http, encodeFunctionData } from "viem";
import { readFileSync, writeFileSync } from "fs";

/**
 * Limpia la posicion vUSDT legado (150 billones de unidades por el bug de
 * decimales 18-vs-6) para que la lectura de health factor refleje solo el
 * colateral BNB real + la deuda real del agente de health factor. Luego
 * recalcula HF y ejecuta la accion protectora si sigue por debajo del umbral.
 */

const UNITROLLER = "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D";
const VUSDT = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";
const USDT = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c";

const comptrollerAbi = JSON.parse(readFileSync("./comptroller-abi.json", "utf-8"));
const oracleAbi = JSON.parse(readFileSync("./oracle-abi.json", "utf-8"));
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

async function readHF() {
  const [, liquidity, shortfall] = await pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "getAccountLiquidity", args: [wallet.address] });
  const borrowBalance = await pub.readContract({ address: VUSDT, abi: vusdtAbi, functionName: "borrowBalanceStored", args: [wallet.address] });
  const oracleAddr = await pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "oracle" });
  const priceUSDT = await pub.readContract({ address: oracleAddr, abi: oracleAbi, functionName: "getUnderlyingPrice", args: [VUSDT] });
  if (borrowBalance === 0n) return { hf: Infinity, liquidity, shortfall, borrowBalance };
  const debtValue = (borrowBalance * priceUSDT) / (10n ** 18n);
  const collateralAdjustedValue = shortfall > 0n ? (debtValue > shortfall ? debtValue - shortfall : 0n) : debtValue + liquidity;
  const hf = Number(collateralAdjustedValue) / Number(debtValue);
  return { hf, liquidity, shortfall, borrowBalance, debtValue };
}

console.log("=== Estado ANTES de limpiar ===");
const before = await readHF();
console.log(`HF (contaminado por legado): ${before.hf.toFixed(4)}  liquidity=${before.liquidity} shortfall=${before.shortfall}\n`);

const vUsdtBalance = await pub.readContract({ address: VUSDT, abi: vusdtAbi, functionName: "balanceOf", args: [wallet.address] });
console.log("vUSDT legado a redimir (raw):", vUsdtBalance.toString());

console.log("\n=== grant_session (scope: vUSDT + Comptroller + USDT) ===");
const session = await client.grantSession({
  wallet,
  signer: adminSigner,
  permissions: {
    calls: [{ to: VUSDT }, { to: UNITROLLER }, { to: USDT }],
    spend: [
      { limit: 1000000000n, period: "day", token: USDT }, // 1000 USDT reales (6 dec) -- cubre repago
      { limit: 2n ** 200n, period: "day", token: VUSDT }, // cap enorme, por si el limite anterior chocaba con algun redondeo
    ],
  },
  expiry: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
});
console.log("Session:", session.publicKey.slice(0, 20) + "...");
writeFileSync("session-cleanup.json", JSON.stringify({ publicKey: session.publicKey, expiry: session.expiry, walletAddress: session.walletAddress }, null, 2));

console.log("\n=== Paso 1: redimir TODO el vUSDT legado ===");
const redeemCall = { to: VUSDT, value: 0n, data: encodeFunctionData({ abi: vusdtAbi, functionName: "redeem", args: [vUsdtBalance] }) };
const r1 = await client.execute({ session, calls: [redeemCall] });
console.log("tx:", r1.status, r1.transactionHash);

console.log("\n=== Estado DESPUES de limpiar (HF real, aislado) ===");
const after = await readHF();
console.log(`HF real: ${after.hf.toFixed(4)}  (deuda: ${(Number(after.borrowBalance)/1e6).toFixed(2)} USDT reales, umbral: ${HF_THRESHOLD})`);
console.log(`liquidity=${after.liquidity} shortfall=${after.shortfall}\n`);

if (after.hf < HF_THRESHOLD) {
  console.log(`HF ${after.hf.toFixed(4)} < umbral ${HF_THRESHOLD} -> repago parcial (30% de la deuda real)`);
  const repayAmount = after.borrowBalance * 30n / 100n;
  console.log("Repagando (raw, 6 dec):", repayAmount.toString(), "=>", (Number(repayAmount)/1e6).toFixed(2), "USDT");
  const approveCall = { to: USDT, value: 0n, data: encodeFunctionData({ abi: usdtAbi, functionName: "approve", args: [VUSDT, repayAmount] }) };
  const repayCall = { to: VUSDT, value: 0n, data: encodeFunctionData({ abi: vusdtAbi, functionName: "repayBorrow", args: [repayAmount] }) };
  const r2 = await client.execute({ session, calls: [approveCall, repayCall] });
  console.log("tx repay:", r2.status, r2.transactionHash);

  const finalState = await readHF();
  console.log(`\nHF tras repago: ${finalState.hf.toFixed(4)}  (deuda: ${(Number(finalState.borrowBalance)/1e6).toFixed(2)} USDT reales)`);
  console.log(finalState.hf > after.hf ? "Mejora confirmada." : "AVISO: el HF no mejoro.");
} else {
  console.log(`HF ${after.hf.toFixed(4)} >= umbral ${HF_THRESHOLD} -> posicion sana, sin accion protectora.`);
}

const usdtBalanceFinal = await pub.readContract({ address: USDT, abi: usdtAbi, functionName: "balanceOf", args: [wallet.address] });
console.log("\nUSDT libre en wallet tras la limpieza (raw):", usdtBalanceFinal.toString(), "=>", (Number(usdtBalanceFinal)/1e6).toFixed(2), "USDT reales");
console.log("Wallet:", wallet.address);
console.log("Explorer:", `https://testnet.bscscan.com/address/${wallet.address}`);
