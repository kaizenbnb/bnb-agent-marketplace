import "dotenv/config";
import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";
import { createPublicClient, http, encodeFunctionData } from "viem";
import { readFileSync, writeFileSync } from "fs";

/**
 * getAccountLiquidity() esta contaminado por una posicion vUSDT legado de
 * 150 billones de unidades (bug de decimales 18-vs-6 en agentes anteriores),
 * y redeem() para limpiarla falla con NoSpendPermissions por una razon no
 * resuelta (2 intentos, cap normal y cap enorme, mismo error -- documentado
 * en AGENT_LOG, no es el bloqueante del entregable).
 *
 * Este script calcula el health factor de forma AISLADA, leyendo solo el
 * colateral BNB real y la deuda USDT real (ambos verificados a mano en la
 * investigacion previa), sin pasar por getAccountLiquidity ni por redeem().
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

async function readIsolatedHF() {
  const oracleAddr = await pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "oracle" });
  const [priceBNB, priceUSDT, [, cfBnb]] = await Promise.all([
    pub.readContract({ address: oracleAddr, abi: oracleAbi, functionName: "getUnderlyingPrice", args: [VBNB] }),
    pub.readContract({ address: oracleAddr, abi: oracleAbi, functionName: "getUnderlyingPrice", args: [VUSDT] }),
    pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "markets", args: [VBNB] }),
  ]);

  const vBnbBalance = await pub.readContract({ address: VBNB, abi: vbnbAbi, functionName: "balanceOf", args: [wallet.address] });
  const vBnbExchangeRate = await pub.readContract({ address: VBNB, abi: vbnbAbi, functionName: "exchangeRateStored" });
  const bnbUnderlying = (vBnbBalance * vBnbExchangeRate) / (10n ** 18n);

  const borrowBalance = await pub.readContract({ address: VUSDT, abi: vusdtAbi, functionName: "borrowBalanceStored", args: [wallet.address] });

  const collateralValue = (bnbUnderlying * priceBNB) / (10n ** 18n);
  const collateralAdjusted = (collateralValue * cfBnb) / (10n ** 18n);
  const debtValue = (borrowBalance * priceUSDT) / (10n ** 18n);

  const hf = debtValue === 0n ? Infinity : Number(collateralAdjusted) / Number(debtValue);
  return { hf, collateralAdjusted, debtValue, borrowBalance, bnbUnderlying };
}

console.log("=== Health factor AISLADO (solo colateral BNB real vs deuda real) ===\n");
const before = await readIsolatedHF();
console.log(`Colateral BNB: ${(Number(before.bnbUnderlying)/1e18).toFixed(6)} BNB`);
console.log(`Deuda: ${(Number(before.borrowBalance)/1e6).toFixed(2)} USDT reales`);
console.log(`HF = ${before.hf.toFixed(4)}  (umbral: ${HF_THRESHOLD})\n`);

if (before.hf >= HF_THRESHOLD) {
  console.log(`HF ${before.hf.toFixed(4)} >= umbral -> posicion sana, sin accion.`);
  process.exit(0);
}

console.log(`HF ${before.hf.toFixed(4)} < umbral ${HF_THRESHOLD} -> repago parcial (30% de la deuda)\n`);

console.log("=== grant_session (scope: vUSDT + USDT, solo para approve+repayBorrow) ===");
const session = await client.grantSession({
  wallet,
  signer: adminSigner,
  permissions: {
    calls: [{ to: VUSDT }, { to: USDT }],
    spend: [{ limit: 1000000000n, period: "day", token: USDT }], // 1000 USDT reales (6 dec)
  },
  expiry: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
});
console.log("Session:", session.publicKey.slice(0, 20) + "...\n");
writeFileSync("session-hf-protect.json", JSON.stringify({ publicKey: session.publicKey, expiry: session.expiry, walletAddress: session.walletAddress }, null, 2));

const repayAmount = before.borrowBalance * 30n / 100n;
console.log("=== Accion protectora: repago parcial ===");
console.log("Repagando (raw, 6 dec):", repayAmount.toString(), "=>", (Number(repayAmount)/1e6).toFixed(2), "USDT");

const approveCall = { to: USDT, value: 0n, data: encodeFunctionData({ abi: usdtAbi, functionName: "approve", args: [VUSDT, repayAmount] }) };
const repayCall = { to: VUSDT, value: 0n, data: encodeFunctionData({ abi: vusdtAbi, functionName: "repayBorrow", args: [repayAmount] }) };
const r = await client.execute({ session, calls: [approveCall, repayCall] });
console.log("tx:", r.status, r.transactionHash);

const after = await readIsolatedHF();
console.log(`\nHF tras repago: ${after.hf.toFixed(4)}  (deuda: ${(Number(after.borrowBalance)/1e6).toFixed(2)} USDT reales)`);
console.log(after.hf > before.hf ? "Mejora confirmada." : "AVISO: el HF no mejoro como se esperaba.");

console.log("\nWallet:", wallet.address);
console.log("Explorer:", `https://testnet.bscscan.com/address/${wallet.address}`);
