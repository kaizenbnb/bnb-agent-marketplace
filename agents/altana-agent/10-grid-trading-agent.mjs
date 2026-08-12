import "dotenv/config";
import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";
import { createPublicClient, http, encodeFunctionData, parseUnits, parseEther } from "viem";
import { readFileSync, writeFileSync } from "fs";

/**
 * Agente de grid trading sobre PancakeSwap V2 (testnet). No hay skill de
 * "grid" en Altana -- se compone con PancakeSwap Trading (getAmountsOut +
 * swapExactETHForTokens/swapExactTokensForETH) mas un loop de umbrales
 * escrito a mano. El par WBNB/USDT(venus) ya tiene liquidez real en
 * testnet (reserve WBNB ~0.1), asi que nuestras propias operaciones mueven
 * el precio de forma predecible dentro del pool -- ideal para demostrar
 * cruces de rejilla en una ventana corta.
 */

const ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const USDT = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c"; // 6 decimales, verificado

const routerAbi = JSON.parse(readFileSync("./router-abi.json", "utf-8"));
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

const TRADE_SIZE_BNB = parseEther("0.008");
const GRID_STEP_PCT = 4; // % de separacion entre niveles
const GRID_LEVELS = 5;   // -8%,-4%,0%,+4%,+8% relativo al precio inicial
const MAX_ITERATIONS = 10;
const MAX_TRADES = 4;
const TICK_DELAY_MS = 3000;

async function quotePrice() {
  const amounts = await pub.readContract({
    address: ROUTER, abi: routerAbi, functionName: "getAmountsOut",
    args: [parseEther("1"), [WBNB, USDT]],
  });
  return amounts[1]; // USDT por 1 WBNB (unidad interna del pool, autoconsistente)
}

function gridCell(price, basePrice) {
  const pctDiff = (Number(price - basePrice) / Number(basePrice)) * 100;
  let cell = Math.round(pctDiff / GRID_STEP_PCT);
  const half = Math.floor(GRID_LEVELS / 2);
  if (cell > half) cell = half;
  if (cell < -half) cell = -half;
  return cell;
}

console.log("=== Agente Grid Trading -- PancakeSwap V2 (BSC testnet) ===\n");
console.log(`Rejilla: ${GRID_LEVELS} niveles, paso ${GRID_STEP_PCT}%, tamano de orden ${(Number(TRADE_SIZE_BNB)/1e18)} BNB\n`);

const basePrice = await quotePrice();
console.log("Precio base (USDT por 1 WBNB, unidad interna del pool):", basePrice.toString());
let lastCell = 0;

console.log("\n=== grant_session (scope: Router + USDT) ===");
const session = await client.grantSession({
  wallet,
  signer: adminSigner,
  permissions: {
    calls: [{ to: ROUTER }, { to: USDT }],
    spend: [
      { limit: parseEther("0.1"), period: "day" }, // nativo: cubre las ventas (BNB->USDT)
      { limit: parseUnits("500", 6), period: "day", token: USDT }, // USDT real (6 dec): cubre approve+compras
    ],
  },
  expiry: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
});
console.log("Session:", session.publicKey.slice(0, 20) + "...\n");
writeFileSync("session-grid.json", JSON.stringify({ publicKey: session.publicKey, expiry: session.expiry, walletAddress: session.walletAddress }, null, 2));

// Sembrar USDT de compra (200 USDT reales, 6 decimales -- correcto esta vez)
console.log("=== Sembrando 200 USDT de test (6 decimales, correcto) ===");
const seedAmount = parseUnits("200", 6);
const allocateCall = { to: USDT, value: 0n, data: encodeFunctionData({ abi: usdtAbi, functionName: "allocateTo", args: [wallet.address, seedAmount] }) };
const seedResult = await client.execute({ session, calls: [allocateCall] });
console.log("Seed tx:", seedResult.status, seedResult.transactionHash, "\n");

let trades = 0;
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 600);

for (let i = 0; i < MAX_ITERATIONS && trades < MAX_TRADES; i++) {
  const price = await quotePrice();
  const cell = gridCell(price, basePrice);
  const pctDiff = ((Number(price - basePrice) / Number(basePrice)) * 100).toFixed(2);
  console.log(`[tick ${i}] precio=${price.toString()} (${pctDiff}% vs base) celda=${cell} (ultima=${lastCell})`);

  if (cell === lastCell) {
    await new Promise(r => setTimeout(r, TICK_DELAY_MS));
    continue;
  }

  if (cell < lastCell) {
    // precio bajo un nivel -> comprar WBNB con un presupuesto fijo de USDT (acumular en el dip)
    const usdtBudget = parseUnits("20", 6);
    console.log(`  -> cruce a la baja: COMPRAR BNB gastando 20 USDT`);
    const quoteOut = await pub.readContract({ address: ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [usdtBudget, [USDT, WBNB]] });
    const amountOutMin = (quoteOut[1] * 97n) / 100n; // 3% slippage
    const approveCall = { to: USDT, value: 0n, data: encodeFunctionData({ abi: usdtAbi, functionName: "approve", args: [ROUTER, usdtBudget] }) };
    const swapCall = {
      to: ROUTER, value: 0n,
      data: encodeFunctionData({ abi: routerAbi, functionName: "swapExactTokensForETH", args: [usdtBudget, amountOutMin, [USDT, WBNB], wallet.address, deadline()] }),
    };
    const r = await client.execute({ session, calls: [approveCall, swapCall] });
    console.log("  tx:", r.status, r.transactionHash);
    trades++;
  } else {
    // precio subio un nivel -> vender BNB por USDT (tomar beneficio en la subida)
    console.log(`  -> cruce al alza: VENDER ${(Number(TRADE_SIZE_BNB)/1e18)} BNB por USDT`);
    const amounts = await pub.readContract({ address: ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [TRADE_SIZE_BNB, [WBNB, USDT]] });
    const amountOutMin = (amounts[1] * 97n) / 100n; // 3% slippage
    const swapCall = {
      to: ROUTER, value: TRADE_SIZE_BNB,
      data: encodeFunctionData({ abi: routerAbi, functionName: "swapExactETHForTokens", args: [amountOutMin, [WBNB, USDT], wallet.address, deadline()] }),
    };
    const r = await client.execute({ session, calls: [swapCall] });
    console.log("  tx:", r.status, r.transactionHash);
    trades++;
  }

  lastCell = cell;
  await new Promise(r => setTimeout(r, TICK_DELAY_MS));
}

console.log(`\n=== Fin: ${trades} operaciones ejecutadas en ${MAX_ITERATIONS} ticks maximos ===`);
const finalPrice = await quotePrice();
const finalPct = ((Number(finalPrice - basePrice) / Number(basePrice)) * 100).toFixed(2);
console.log(`Precio final: ${finalPrice.toString()} (${finalPct}% vs base)`);
console.log("\nWallet:", wallet.address);
console.log("Explorer:", `https://testnet.bscscan.com/address/${wallet.address}`);
