import "dotenv/config";
import { createPublicClient, http } from "viem";
import { readFileSync } from "fs";
const vusdtAbi = JSON.parse(readFileSync("./vusdt-abi.json", "utf-8"));
const vbnbAbi = JSON.parse(readFileSync("./vbnb-abi.json", "utf-8"));
const comptrollerAbi = JSON.parse(readFileSync("./comptroller-abi.json", "utf-8"));
const oracleAbi = JSON.parse(readFileSync("./oracle-abi.json", "utf-8"));
const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });
const wallet = process.env.WALLET_ADDRESS;
const UNITROLLER = "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D";
const VBNB = "0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c";
const VUSDT = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";

const oracleAddr = await pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "oracle" });
const priceBNB = await pub.readContract({ address: oracleAddr, abi: oracleAbi, functionName: "getUnderlyingPrice", args: [VBNB] });
const priceUSDT = await pub.readContract({ address: oracleAddr, abi: oracleAbi, functionName: "getUnderlyingPrice", args: [VUSDT] });
console.log("priceBNB (raw):", priceBNB.toString());
console.log("priceUSDT (raw):", priceUSDT.toString());

const vBnbBalance = await pub.readContract({ address: VBNB, abi: vbnbAbi, functionName: "balanceOf", args: [wallet] });
const vBnbExchangeRate = await pub.readContract({ address: VBNB, abi: [{"type":"function","name":"exchangeRateStored","stateMutability":"view","inputs":[],"outputs":[{"type":"uint256"}]}], functionName: "exchangeRateStored" });
console.log("vBNB balance (raw):", vBnbBalance.toString());
console.log("vBNB exchangeRateStored (raw):", vBnbExchangeRate.toString());
const bnbUnderlying = (vBnbBalance * vBnbExchangeRate) / (10n**18n);
console.log("BNB colateral subyacente (raw, 18 dec):", bnbUnderlying.toString(), "=>", (Number(bnbUnderlying)/1e18).toFixed(6), "BNB");

const [errNow, liqNow, shortNow] = await pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "getAccountLiquidity", args: [wallet] });
console.log("\ngetAccountLiquidity AHORA -> error:", errNow.toString(), "liquidity:", liqNow.toString(), "shortfall:", shortNow.toString());

const [isListedBnb, cfBnb] = await pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "markets", args: [VBNB] });
console.log("vBNB collateralFactor (raw):", cfBnb.toString());

// Calculo manual del valor de colateral ajustado: bnbUnderlying(18dec) * priceBNB(scale 1e18) / 1e18 * CF/1e18
const collateralValueRaw = (bnbUnderlying * priceBNB) / (10n**18n);
const collateralAdjusted = (collateralValueRaw * cfBnb) / (10n**18n);
console.log("\nValor colateral (unidad oraculo, sin CF):", collateralValueRaw.toString());
console.log("Valor colateral ajustado (con CF 70%):", collateralAdjusted.toString());
