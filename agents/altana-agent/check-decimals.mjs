import { createPublicClient, http } from "viem";
import { readFileSync } from "fs";
const usdtAbi = JSON.parse(readFileSync("./usdt-abi.json", "utf-8"));
const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });
const dec = await pub.readContract({ address: "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c", abi: usdtAbi, functionName: "decimals" });
console.log("USDT.decimals() real en testnet:", dec);
const vDec = await pub.readContract({ address: "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A", abi: usdtAbi, functionName: "decimals" });
console.log("vUSDT.decimals() real en testnet:", vDec);
