import "dotenv/config";
import { createPublicClient, http, formatEther } from "viem";
const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });
const bal = await pub.getBalance({ address: process.env.WALLET_ADDRESS });
console.log("tBNB disponible:", formatEther(bal));
