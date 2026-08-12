import "dotenv/config";
import { createPublicClient, http } from "viem";
import { readFileSync } from "fs";
const usdtAbi = JSON.parse(readFileSync("./usdt-abi.json", "utf-8"));
const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency: {name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls: {default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });
const bal = await pub.readContract({ address: "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c", abi: usdtAbi, functionName: "balanceOf", args: [process.env.WALLET_ADDRESS] });
console.log("USDT balance actual:", (Number(bal)/1e18).toFixed(2));
