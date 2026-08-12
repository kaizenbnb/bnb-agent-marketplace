import "dotenv/config";
import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";
import { createPublicClient, http, encodeFunctionData, parseUnits, parseEther } from "viem";
import { readFileSync, writeFileSync } from "fs";

/**
 * Agente de grid trading v2 sobre PancakeSwap V2 (testnet), par WBNB/BUSD
 * oficial de BNB Chain testnet (12.5 WBNB de reserva -- razonablemente
 * escalado, a diferencia del par WBNB/USDT-Venus que esta inflado por un
 * bug de decimales de otro equipo, ver 10-grid-trading-agent.mjs).
 *
 * Capital disponible (~0.2 tBNB) es pequeno frente al pool (12.5 WBNB), asi
 * que el tamano de orden y el paso de rejilla se calibran para que cada
 * operacion mueva el precio ~0.4-0.5%, en vez del 4% original (imposible
 * con este capital contra un pool de esta profundidad).
 */

const ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const BUSD = "0x78867BbEeF44f2326bF8DDd1941a4439382EF2A7"; // BUSD oficial BNB Chain testnet, 18 dec

const routerAbi = JSON.parse(readFileSync("./router-abi.json", "utf-8"));
const erc20Abi = [
  {"type":"function","name":"approve","stateMutability":"nonpayable","inputs":[{"type":"address","name":"spender"},{"type":"uint256","name":"amount"}],"outputs":[{"type":"bool"}]},
  {"type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"type":"address","name":"owner"}],"outputs":[{"type":"uint256"}]},
];

const wallet = { address: process.env.WALLET_ADDRESS };
const adminSigner = signerFromPrivateKey(process.env.ADMIN_PRIVATE_KEY);
const client = createClient({ chains: [BNB_TESTNET] });

const bscTestnetRO = {
  id: 97, name: "BSC Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: ["https://bsc-testnet-rpc.publicnode.com"] } },
};
const pub = createPublicClient({ chain: bscTestnetRO, transport: http() });

const TRADE_SIZE_BNB = parseEther("0.05"); // ~0.4% de impacto en un pool de ~12.5 WBNB
const GRID_STEP_PCT = 0.4;
const GRID_LEVELS = 5;
const MAX_ITERATIONS = 8;
const MAX_TRADES = 3;
const TICK_DELAY_MS = 2500;

async function quotePrice() {
  const amounts = await pub.readContract({ address: ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [parseEther("1"), [WBNB, BUSD]] });
  return amounts[1];
}

function gridCell(price, basePrice) {
  const pctDiff = (Number(price - basePrice) / Number(basePrice)) * 100;
  let cell = Math.round(pctDiff / GRID_STEP_PCT);
  const half = Math.floor(GRID_LEVELS / 2);
  if (cell > half) cell = half;
  if (cell < -half) cell = -half;
  return cell;
}

console.log("=== Agente Grid Trading v2 -- PancakeSwap V2, WBNB/BUSD testnet ===\n");
console.log(`Rejilla: ${GRID_LEVELS} niveles, paso ${GRID_STEP_PCT}%, orden ${(Number(TRADE_SIZE_BNB)/1e18)} BNB\n`);

const basePrice = await quotePrice();
console.log("Precio base (BUSD por 1 WBNB):", (Number(basePrice)/1e18).toFixed(4));
let lastCell = 0;

console.log("\n=== grant_session (scope: Router + BUSD) ===");
const session = await client.grantSession({
  wallet,
  signer: adminSigner,
  permissions: {
    calls: [{ to: ROUTER }, { to: BUSD }],
    spend: [
      { limit: parseEther("0.25"), period: "day" },
      { limit: parseUnits("500", 18), period: "day", token: BUSD },
    ],
  },
  expiry: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
});
console.log("Session:", session.publicKey.slice(0, 20) + "...\n");
writeFileSync("session-grid-v2.json", JSON.stringify({ publicKey: session.publicKey, expiry: session.expiry, walletAddress: session.walletAddress }, null, 2));

let trades = 0;
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 600);

async function doSell() {
  const amounts = await pub.readContract({ address: ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [TRADE_SIZE_BNB, [WBNB, BUSD]] });
  const amountOutMin = (amounts[1] * 97n) / 100n;
  const swapCall = { to: ROUTER, value: TRADE_SIZE_BNB, data: encodeFunctionData({ abi: routerAbi, functionName: "swapExactETHForTokens", args: [amountOutMin, [WBNB, BUSD], wallet.address, deadline()] }) };
  return client.execute({ session, calls: [swapCall] });
}

async function doBuy() {
  const busdBalance = await pub.readContract({ address: BUSD, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
  const amounts = await pub.readContract({ address: ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [TRADE_SIZE_BNB, [WBNB, BUSD]] });
  const busdBudget = amounts[1] < busdBalance ? amounts[1] : busdBalance;
  if (busdBudget === 0n) { console.log("  (sin BUSD para comprar, salto)"); return null; }
  const quoteOut = await pub.readContract({ address: ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [busdBudget, [BUSD, WBNB]] });
  const amountOutMin = (quoteOut[1] * 97n) / 100n;
  const approveCall = { to: BUSD, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ROUTER, busdBudget] }) };
  const swapCall = { to: ROUTER, value: 0n, data: encodeFunctionData({ abi: routerAbi, functionName: "swapExactTokensForETH", args: [busdBudget, amountOutMin, [BUSD, WBNB], wallet.address, deadline()] }) };
  return client.execute({ session, calls: [approveCall, swapCall] });
}

// Kick-off: sin BUSD en cartera, la primera accion tiene que ser una venta
// (BNB->BUSD) para generar inventario y arrancar el movimiento de precio.
console.log("=== Kick-off: venta inicial (no hay BUSD en cartera para comprar primero) ===");
const kickoff = await doSell();
console.log("tx:", kickoff.status, kickoff.transactionHash);
trades++;
lastCell = gridCell(await quotePrice(), basePrice);
console.log("Celda tras kick-off:", lastCell, "\n");

for (let i = 0; i < MAX_ITERATIONS && trades < MAX_TRADES; i++) {
  const price = await quotePrice();
  const cell = gridCell(price, basePrice);
  const pctDiff = ((Number(price - basePrice) / Number(basePrice)) * 100).toFixed(3);
  console.log(`[tick ${i}] precio=${(Number(price)/1e18).toFixed(4)} BUSD (${pctDiff}% vs base) celda=${cell} (ultima=${lastCell})`);

  if (cell === lastCell) {
    await new Promise(r => setTimeout(r, TICK_DELAY_MS));
    continue;
  }

  if (cell < lastCell) {
    console.log(`  -> cruce a la baja: COMPRAR BNB con BUSD`);
    const r = await doBuy();
    if (r) console.log("  tx:", r.status, r.transactionHash);
    trades++;
  } else {
    console.log(`  -> cruce al alza: VENDER BNB por BUSD`);
    const r = await doSell();
    console.log("  tx:", r.status, r.transactionHash);
    trades++;
  }
  lastCell = cell;
  await new Promise(r => setTimeout(r, TICK_DELAY_MS));
}

console.log(`\n=== Fin: ${trades} operaciones ejecutadas ===`);
const finalPrice = await quotePrice();
const finalPct = ((Number(finalPrice - basePrice) / Number(basePrice)) * 100).toFixed(3);
console.log(`Precio final: ${(Number(finalPrice)/1e18).toFixed(4)} BUSD (${finalPct}% vs base)`);
console.log("\nWallet:", wallet.address);
console.log("Explorer:", `https://testnet.bscscan.com/address/${wallet.address}`);
