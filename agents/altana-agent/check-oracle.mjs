import { createPublicClient, http } from "viem";
import { readFileSync } from "fs";

const UNITROLLER = "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D";
const VBNB = "0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c";
const VUSDT = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";

const comptrollerAbi = JSON.parse(readFileSync("./comptroller-abi.json", "utf-8"));
const oracleAbi = JSON.parse(readFileSync("./oracle-abi.json", "utf-8"));

const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });

const [isListed, cfMantissa] = await pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "markets", args: [VBNB] });
console.log("vBNB isListed:", isListed, "| collateralFactor:", (Number(cfMantissa)/1e18*100).toFixed(2), "%");

const closeFactor = await pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "closeFactorMantissa" });
console.log("closeFactor (max % de deuda repagable de una vez):", (Number(closeFactor)/1e18*100).toFixed(2), "%");

const oracleAddr = await pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "oracle" });
console.log("Oracle:", oracleAddr);

try {
  const priceBNB = await pub.readContract({ address: oracleAddr, abi: oracleAbi, functionName: "getUnderlyingPrice", args: [VBNB] });
  console.log("Precio BNB (oracle, scaled 1e18):", priceBNB.toString(), "=>", (Number(priceBNB)/1e18).toFixed(4), "USD");
} catch (e) {
  console.log("Precio BNB: ERROR ->", e.shortMessage || e.message);
}

try {
  const priceUSDT = await pub.readContract({ address: oracleAddr, abi: oracleAbi, functionName: "getUnderlyingPrice", args: [VUSDT] });
  console.log("Precio USDT (oracle, scaled 1e18):", priceUSDT.toString(), "=>", (Number(priceUSDT)/1e18).toFixed(4), "USD");
} catch (e) {
  console.log("Precio USDT: ERROR ->", e.shortMessage || e.message);
}
