import { createPublicClient, http } from "viem";

const ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const FACTORY = "0x6725F303b657a9451d8BA641348b6761A6CC7a17";

const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });

const routerAbi = [
  {type:"function", name:"WETH", stateMutability:"view", inputs:[], outputs:[{type:"address"}]},
  {type:"function", name:"factory", stateMutability:"view", inputs:[], outputs:[{type:"address"}]},
];
const factoryAbi = [
  {type:"function", name:"getPair", stateMutability:"view", inputs:[{type:"address"},{type:"address"}], outputs:[{type:"address"}]},
  {type:"function", name:"allPairsLength", stateMutability:"view", inputs:[], outputs:[{type:"uint256"}]},
  {type:"function", name:"allPairs", stateMutability:"view", inputs:[{type:"uint256"}], outputs:[{type:"address"}]},
];

const weth = await pub.readContract({ address: ROUTER, abi: routerAbi, functionName: "WETH" });
console.log("Router.WETH() (WBNB testnet real):", weth);

const factoryFromRouter = await pub.readContract({ address: ROUTER, abi: routerAbi, functionName: "factory" });
console.log("Router.factory():", factoryFromRouter, factoryFromRouter.toLowerCase() === FACTORY.toLowerCase() ? "(coincide)" : "(NO coincide!)");

const pairCount = await pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: "allPairsLength" });
console.log("Numero total de pares en el Factory testnet:", pairCount.toString());
