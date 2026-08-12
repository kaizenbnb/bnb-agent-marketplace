import { createPublicClient, http } from "viem";
import { readFileSync } from "fs";
const vusdtAbi = JSON.parse(readFileSync("./vusdt-abi.json", "utf-8"));
const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });
const wallet = "0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb";
const VUSDT = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";

const vUsdtBal = await pub.readContract({ address: VUSDT, abi: vusdtAbi, functionName: "balanceOf", args: [wallet] });
const exchangeRate = await pub.readContract({ address: VUSDT, abi: vusdtAbi, functionName: "exchangeRateStored" });
const underlying = (vUsdtBal * exchangeRate) / (10n**18n);
console.log("vUSDT balance (raw, 8 dec):", vUsdtBal.toString());
console.log("USDT subyacente en la posicion de supply (RAW, 6 dec real):", underlying.toString());
console.log("  => en 'USDT reales' (dividiendo por 1e6):", (Number(underlying)/1e6).toFixed(2));
console.log("  => lo que yo CREIA que eran (dividiendo por 1e18, mi bug anterior):", (Number(underlying)/1e18).toFixed(2));
