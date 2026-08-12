import { createPublicClient, http } from "viem";

const POOL = "0x270E1420eFc26e4945113730a4c3D5cfF58A73ea"; // WBNB/USDT-oficial, fee 0.25%
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const USDT_OFFICIAL = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";

const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });

const erc20Abi = [{type:"function", name:"balanceOf", stateMutability:"view", inputs:[{type:"address"}], outputs:[{type:"uint256"}]},
                  {type:"function", name:"decimals", stateMutability:"view", inputs:[], outputs:[{type:"uint8"}]}];

const wbnbBal = await pub.readContract({ address: WBNB, abi: erc20Abi, functionName: "balanceOf", args: [POOL] });
const usdtBal = await pub.readContract({ address: USDT_OFFICIAL, abi: erc20Abi, functionName: "balanceOf", args: [POOL] });
const usdtDec = await pub.readContract({ address: USDT_OFFICIAL, abi: erc20Abi, functionName: "decimals" });

console.log("WBNB en el pool:", (Number(wbnbBal)/1e18).toFixed(4), "WBNB");
console.log(`USDT en el pool (${usdtDec} dec):`, (Number(usdtBal)/10**usdtDec).toFixed(4), "USDT");
console.log("Precio implicito:", (Number(usdtBal)/10**usdtDec) / (Number(wbnbBal)/1e18), "USDT/WBNB");
