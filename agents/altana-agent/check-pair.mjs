import { createPublicClient, http } from "viem";
const FACTORY = "0x6725F303b657a9451d8BA641348b6761A6CC7a17";
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const USDT_VENUS = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c";

const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });

const factoryAbi = [{type:"function", name:"getPair", stateMutability:"view", inputs:[{type:"address"},{type:"address"}], outputs:[{type:"address"}]}];
const pairAbi = [{type:"function", name:"getReserves", stateMutability:"view", inputs:[], outputs:[{type:"uint112"},{type:"uint112"},{type:"uint32"}]},
                 {type:"function", name:"token0", stateMutability:"view", inputs:[], outputs:[{type:"address"}]}];

const pairAddr = await pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getPair", args: [WBNB, USDT_VENUS] });
console.log("Pair WBNB/USDT_venus:", pairAddr);

if (pairAddr !== "0x0000000000000000000000000000000000000000") {
  const [r0, r1] = await pub.readContract({ address: pairAddr, abi: pairAbi, functionName: "getReserves" });
  const token0 = await pub.readContract({ address: pairAddr, abi: pairAbi, functionName: "token0" });
  console.log("token0:", token0, "reserve0:", r0.toString(), "reserve1:", r1.toString());
} else {
  console.log("No existe el par -- habria que crearlo.");
}
