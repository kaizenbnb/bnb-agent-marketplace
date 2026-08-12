import "dotenv/config";
import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";
import { createPublicClient, http, encodeFunctionData, parseEther, parseUnits } from "viem";
import { readFileSync, writeFileSync } from "fs";

/**
 * Agente de rebalancing minimo sobre PancakeSwap V3 (testnet). No hay skill
 * de "rebalancing" en Altana, ni siquiera de liquidez V3 (solo V2) -- se
 * compone a mano contra el NonfungiblePositionManager. Version minima:
 * abre UNA posicion concentrada, la cierra, y abre una segunda posicion en
 * un rango desplazado (el "ajuste real" pedido). No es un loop continuo.
 */

const V2_ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const V3_NPM = "0x427bF5b37357632377eCbEC9de3626C71A5396c1"; // testnet, distinta de mainnet
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const USDT_OFFICIAL = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
const POOL = "0x270E1420eFc26e4945113730a4c3D5cfF58A73ea"; // WBNB/USDT-oficial, fee 0.25%
const FEE = 2500;
const TICK_SPACING = 50;

const routerAbi = JSON.parse(readFileSync("./router-abi.json", "utf-8"));
const npmAbi = JSON.parse(readFileSync("./v3-npm-abi.json", "utf-8"));
const wethAbi = JSON.parse(readFileSync("./weth-abi.json", "utf-8"));
const usdtAbi = [
  {"type":"function","name":"approve","stateMutability":"nonpayable","inputs":[{"type":"address"},{"type":"uint256"}],"outputs":[{"type":"bool"}]},
  {"type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"type":"address"}],"outputs":[{"type":"uint256"}]},
];
const poolAbi = [
  {"type":"function","name":"slot0","stateMutability":"view","inputs":[],"outputs":[{"type":"uint160"},{"type":"int24"},{"type":"uint16"},{"type":"uint16"},{"type":"uint16"},{"type":"uint32"},{"type":"bool"}]},
  {"type":"function","name":"token0","stateMutability":"view","inputs":[],"outputs":[{"type":"address"}]},
  {"type":"function","name":"token1","stateMutability":"view","inputs":[],"outputs":[{"type":"address"}]},
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
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 600);

function alignedRange(tick, halfWidth) {
  const lower = Math.floor((tick - halfWidth) / TICK_SPACING) * TICK_SPACING;
  const upper = Math.ceil((tick + halfWidth) / TICK_SPACING) * TICK_SPACING;
  return { tickLower: lower, tickUpper: upper };
}

console.log("=== Agente Rebalancing minimo -- PancakeSwap V3 (BSC testnet) ===\n");

const [token0, token1, slot0] = await Promise.all([
  pub.readContract({ address: POOL, abi: poolAbi, functionName: "token0" }),
  pub.readContract({ address: POOL, abi: poolAbi, functionName: "token1" }),
  pub.readContract({ address: POOL, abi: poolAbi, functionName: "slot0" }),
]);
const currentTick = slot0[1];
console.log(`Pool: token0=${token0} token1=${token1}`);
console.log(`Tick actual: ${currentTick}, tickSpacing: ${TICK_SPACING}\n`);

console.log("=== grant_session (scope: V2 Router + USDT + WBNB + V3 NPM) ===");
const session = await client.grantSession({
  wallet,
  signer: adminSigner,
  permissions: {
    calls: [{ to: V2_ROUTER }, { to: USDT_OFFICIAL }, { to: WBNB }, { to: V3_NPM }],
    spend: [
      { limit: parseEther("0.1"), period: "day" },
      { limit: parseUnits("50", 18), period: "day", token: USDT_OFFICIAL },
      { limit: parseEther("1"), period: "day", token: WBNB },
    ],
  },
  expiry: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
});
console.log("Session:", session.publicKey.slice(0, 20) + "...\n");
writeFileSync("session-rebalance.json", JSON.stringify({ publicKey: session.publicKey, expiry: session.expiry, walletAddress: session.walletAddress }, null, 2));

// --- Paso 1: conseguir USDT-oficial (swap V2, no tenemos mint rights) -----
console.log("=== Paso 1: swap 0.03 tBNB -> USDT-oficial (V2, para tener el segundo activo) ===");
const swapAmount = parseEther("0.03");
const quoteUsdt = await pub.readContract({ address: V2_ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [swapAmount, [WBNB, USDT_OFFICIAL]] });
const swapCall = {
  to: V2_ROUTER, value: swapAmount,
  data: encodeFunctionData({ abi: routerAbi, functionName: "swapExactETHForTokens", args: [(quoteUsdt[1] * 97n) / 100n, [WBNB, USDT_OFFICIAL], wallet.address, deadline()] }),
};
const r1 = await client.execute({ session, calls: [swapCall] });
console.log("tx:", r1.status, r1.transactionHash);
const usdtBal = await pub.readContract({ address: USDT_OFFICIAL, abi: usdtAbi, functionName: "balanceOf", args: [wallet.address] });
console.log("USDT-oficial obtenido:", (Number(usdtBal) / 1e18).toFixed(6), "\n");

// --- Paso 2: wrap tBNB -> WBNB (para el otro lado de la posicion) ----------
console.log("=== Paso 2: wrap 0.02 tBNB -> WBNB ===");
const wrapAmount = parseEther("0.02");
const wrapCall = { to: WBNB, value: wrapAmount, data: encodeFunctionData({ abi: wethAbi, functionName: "deposit", args: [] }) };
const r2 = await client.execute({ session, calls: [wrapCall] });
console.log("tx:", r2.status, r2.transactionHash);
const wbnbBal = await pub.readContract({ address: WBNB, abi: wethAbi, functionName: "balanceOf", args: [wallet.address] });
console.log("WBNB en wallet:", (Number(wbnbBal) / 1e18).toFixed(6), "\n");

// --- Paso 3: mint posicion concentrada A (rango estrecho, +-500 ticks) ----
console.log("=== Paso 3: mint posicion A (rango estrecho alrededor del tick actual) ===");
const rangeA = alignedRange(currentTick, 500);
console.log(`Rango A: [${rangeA.tickLower}, ${rangeA.tickUpper}]`);

const amount0Desired = token0.toLowerCase() === USDT_OFFICIAL.toLowerCase() ? usdtBal : wbnbBal;
const amount1Desired = token0.toLowerCase() === USDT_OFFICIAL.toLowerCase() ? wbnbBal : usdtBal;

const approve0 = { to: token0, value: 0n, data: encodeFunctionData({ abi: usdtAbi, functionName: "approve", args: [V3_NPM, amount0Desired] }) };
const approve1 = { to: token1, value: 0n, data: encodeFunctionData({ abi: usdtAbi, functionName: "approve", args: [V3_NPM, amount1Desired] }) };
const mintParamsA = {
  token0, token1, fee: FEE, tickLower: rangeA.tickLower, tickUpper: rangeA.tickUpper,
  amount0Desired, amount1Desired, amount0Min: 0n, amount1Min: 0n,
  recipient: wallet.address, deadline: deadline(),
};
const mintCallA = { to: V3_NPM, value: 0n, data: encodeFunctionData({ abi: npmAbi, functionName: "mint", args: [mintParamsA] }) };
const r3 = await client.execute({ session, calls: [approve0, approve1, mintCallA] });
console.log("tx:", r3.status, r3.transactionHash);

// Necesitamos el tokenId real minteado -- lo leemos via logs de la tx o por balance de posiciones.
// El NPM emite Transfer(0x0, wallet, tokenId) como ERC721; leemos el ultimo evento del log de la tx.
const receiptA = await pub.getTransactionReceipt({ hash: r3.transactionHash });
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const mintLog = receiptA.logs.find(l => l.address.toLowerCase() === V3_NPM.toLowerCase() && l.topics[0] === transferTopic);
const tokenIdA = BigInt(mintLog.topics[3]);
console.log("Posicion A minteada, tokenId:", tokenIdA.toString());

const posA = await pub.readContract({ address: V3_NPM, abi: npmAbi, functionName: "positions", args: [tokenIdA] });
console.log("Liquidez de la posicion A:", posA[7].toString(), "\n");

// --- Paso 4: AJUSTE REAL -- cerrar A y reabrir en un rango desplazado -----
console.log("=== Paso 4: ajuste real -- cerrar posicion A y reabrir desplazada (reposicionar) ===");
const liquidityA = posA[7];
const decreaseCall = {
  to: V3_NPM, value: 0n,
  data: encodeFunctionData({ abi: npmAbi, functionName: "decreaseLiquidity", args: [{ tokenId: tokenIdA, liquidity: liquidityA, amount0Min: 0n, amount1Min: 0n, deadline: deadline() }] }),
};
const collectCall = {
  to: V3_NPM, value: 0n,
  data: encodeFunctionData({ abi: npmAbi, functionName: "collect", args: [{ tokenId: tokenIdA, recipient: wallet.address, amount0Max: 2n ** 128n - 1n, amount1Max: 2n ** 128n - 1n }] }),
};
const r4 = await client.execute({ session, calls: [decreaseCall, collectCall] });
console.log("tx cierre A:", r4.status, r4.transactionHash);

const usdtBal2 = await pub.readContract({ address: USDT_OFFICIAL, abi: usdtAbi, functionName: "balanceOf", args: [wallet.address] });
const wbnbBal2 = await pub.readContract({ address: WBNB, abi: wethAbi, functionName: "balanceOf", args: [wallet.address] });
console.log("Recuperado tras cerrar A -- USDT:", (Number(usdtBal2)/1e18).toFixed(6), "WBNB:", (Number(wbnbBal2)/1e18).toFixed(6));

// Nuevo rango: desplazado +250 ticks (5 tickSpacings) respecto al original -- simula "el precio se movio, reposiciono"
const slot0After = await pub.readContract({ address: POOL, abi: poolAbi, functionName: "slot0" });
const tickAfter = slot0After[1];
const rangeB = alignedRange(tickAfter + 250, 500);
console.log(`\nRango B (desplazado): [${rangeB.tickLower}, ${rangeB.tickUpper}]`);

const amount0DesiredB = token0.toLowerCase() === USDT_OFFICIAL.toLowerCase() ? usdtBal2 : wbnbBal2;
const amount1DesiredB = token0.toLowerCase() === USDT_OFFICIAL.toLowerCase() ? wbnbBal2 : usdtBal2;
const approve0B = { to: token0, value: 0n, data: encodeFunctionData({ abi: usdtAbi, functionName: "approve", args: [V3_NPM, amount0DesiredB] }) };
const approve1B = { to: token1, value: 0n, data: encodeFunctionData({ abi: usdtAbi, functionName: "approve", args: [V3_NPM, amount1DesiredB] }) };
const mintParamsB = {
  token0, token1, fee: FEE, tickLower: rangeB.tickLower, tickUpper: rangeB.tickUpper,
  amount0Desired: amount0DesiredB, amount1Desired: amount1DesiredB, amount0Min: 0n, amount1Min: 0n,
  recipient: wallet.address, deadline: deadline(),
};
const mintCallB = { to: V3_NPM, value: 0n, data: encodeFunctionData({ abi: npmAbi, functionName: "mint", args: [mintParamsB] }) };
const r5 = await client.execute({ session, calls: [approve0B, approve1B, mintCallB] });
console.log("tx reposicionar (mint B):", r5.status, r5.transactionHash);

const receiptB = await pub.getTransactionReceipt({ hash: r5.transactionHash });
const mintLogB = receiptB.logs.find(l => l.address.toLowerCase() === V3_NPM.toLowerCase() && l.topics[0] === transferTopic);
const tokenIdB = BigInt(mintLogB.topics[3]);
const posB = await pub.readContract({ address: V3_NPM, abi: npmAbi, functionName: "positions", args: [tokenIdB] });

console.log("\n=== Resultado ===");
console.log(`Posicion A (cerrada): tokenId ${tokenIdA}, rango [${rangeA.tickLower}, ${rangeA.tickUpper}]`);
console.log(`Posicion B (activa):  tokenId ${tokenIdB}, rango [${rangeB.tickLower}, ${rangeB.tickUpper}], liquidez ${posB[7].toString()}`);
console.log("\nWallet:", wallet.address);
console.log("Explorer:", `https://testnet.bscscan.com/address/${wallet.address}`);
