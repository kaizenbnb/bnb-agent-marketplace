import "dotenv/config";
import { createPublicClient, http } from "viem";
import { readFileSync } from "fs";
const vusdtAbi = JSON.parse(readFileSync("./vusdt-abi.json", "utf-8"));
const comptrollerAbi = JSON.parse(readFileSync("./comptroller-abi.json", "utf-8"));
const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });
const wallet = process.env.WALLET_ADDRESS;

const borrowBalance = await pub.readContract({ address: "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A", abi: vusdtAbi, functionName: "borrowBalanceStored", args: [wallet] });
console.log("borrowBalanceStored (RAW, sin dividir):", borrowBalance.toString());

const usdtAbi = JSON.parse(readFileSync("./usdt-abi.json", "utf-8"));
const usdtBal = await pub.readContract({ address: "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c", abi: usdtAbi, functionName: "balanceOf", args: [wallet] });
console.log("USDT en wallet tras el borrow (RAW):", usdtBal.toString(), "=>", (Number(usdtBal)/1e6).toFixed(6), "USDT (asumiendo 6 decimales)");

const [error, liquidity, shortfall] = await pub.readContract({ address: "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D", abi: comptrollerAbi, functionName: "getAccountLiquidity", args: [wallet] });
console.log("getAccountLiquidity -> error:", error.toString(), "liquidity:", liquidity.toString(), "shortfall:", shortfall.toString());
