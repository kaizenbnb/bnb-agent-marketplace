import "dotenv/config";
import { createPublicClient, http } from "viem";
import { readFileSync } from "fs";

const UNITROLLER = "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D";
const VBNB = "0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c";
const VUSDT = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";

const comptrollerAbi = JSON.parse(readFileSync("./comptroller-abi.json", "utf-8"));
const oracleAbi = JSON.parse(readFileSync("./oracle-abi.json", "utf-8"));
const vbnbAbi = JSON.parse(readFileSync("./vbnb-abi.json", "utf-8"));
const vusdtAbi = JSON.parse(readFileSync("./vusdt-abi.json", "utf-8"));

const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });
const wallet = process.env.WALLET_ADDRESS;

const oracleAddr = await pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "oracle" });
const [priceBNB, priceUSDT, [, cfBnb]] = await Promise.all([
  pub.readContract({ address: oracleAddr, abi: oracleAbi, functionName: "getUnderlyingPrice", args: [VBNB] }),
  pub.readContract({ address: oracleAddr, abi: oracleAbi, functionName: "getUnderlyingPrice", args: [VUSDT] }),
  pub.readContract({ address: UNITROLLER, abi: comptrollerAbi, functionName: "markets", args: [VBNB] }),
]);
const vBnbBalance = await pub.readContract({ address: VBNB, abi: vbnbAbi, functionName: "balanceOf", args: [wallet] });
const vBnbExchangeRate = await pub.readContract({ address: VBNB, abi: vbnbAbi, functionName: "exchangeRateStored" });
const bnbUnderlying = (vBnbBalance * vBnbExchangeRate) / (10n**18n);
const borrowBalance = await pub.readContract({ address: VUSDT, abi: vusdtAbi, functionName: "borrowBalanceStored", args: [wallet] });

const collateralValue = (bnbUnderlying * priceBNB) / (10n**18n);
const collateralAdjusted = (collateralValue * cfBnb) / (10n**18n);
const debtValue = (borrowBalance * priceUSDT) / (10n**18n);
const hf = Number(collateralAdjusted) / Number(debtValue);

console.log("Deuda restante:", (Number(borrowBalance)/1e6).toFixed(2), "USDT reales");
console.log("HF final:", hf.toFixed(4));
