import { createPublicClient, http } from "viem";
import { readFileSync } from "fs";
const vusdtAbi = JSON.parse(readFileSync("./vusdt-abi.json", "utf-8"));
const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });
const VUSDT = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";
const cash = await pub.readContract({ address: VUSDT, abi: vusdtAbi, functionName: "getCash" });
console.log("getCash() del pool vUSDT (raw, 6 dec):", cash.toString(), "=>", (Number(cash)/1e6).toFixed(2), "USDT");
