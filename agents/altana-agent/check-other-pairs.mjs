import { createPublicClient, http } from "viem";
const FACTORY = "0x6725F303b657a9451d8BA641348b6761A6CC7a17";
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";

// Candidatos conocidos de stablecoins de testnet BSC
const candidates = {
  "BUSD (BNB Chain testnet oficial)": "0x78867BbEeF44f2326bF8DDd1941a4439382EF2A7",
  "USDT (BNB Chain testnet oficial, distinto del mock Venus)": "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
  "CAKE testnet": "0xFa60D973F7642B748046464e165A65B7323860",
};

const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });
const factoryAbi = [{type:"function", name:"getPair", stateMutability:"view", inputs:[{type:"address"},{type:"address"}], outputs:[{type:"address"}]}];
const pairAbi = [{type:"function", name:"getReserves", stateMutability:"view", inputs:[], outputs:[{type:"uint112"},{type:"uint112"},{type:"uint32"}]},
                 {type:"function", name:"token0", stateMutability:"view", inputs:[], outputs:[{type:"address"}]}];
const erc20Abi = [{type:"function", name:"decimals", stateMutability:"view", inputs:[], outputs:[{type:"uint8"}]},
                  {type:"function", name:"symbol", stateMutability:"view", inputs:[], outputs:[{type:"string"}]}];

for (const [label, addr] of Object.entries(candidates)) {
  try {
    const pairAddr = await pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getPair", args: [WBNB, addr] });
    if (pairAddr === "0x0000000000000000000000000000000000000000") {
      console.log(`${label}: SIN PAR`);
      continue;
    }
    const [r0, r1] = await pub.readContract({ address: pairAddr, abi: pairAbi, functionName: "getReserves" });
    const token0 = await pub.readContract({ address: pairAddr, abi: pairAbi, functionName: "token0" });
    const isToken0 = token0.toLowerCase() === addr.toLowerCase();
    const tokenDec = await pub.readContract({ address: addr, abi: erc20Abi, functionName: "decimals" }).catch(()=>null);
    const sym = await pub.readContract({ address: addr, abi: erc20Abi, functionName: "symbol" }).catch(()=>"?");
    console.log(`${label} [${sym}, ${tokenDec} dec]: par=${pairAddr}`);
    console.log(`  reserve token=${isToken0?r0:r1}  reserve WBNB=${isToken0?r1:r0} (${(Number(isToken0?r1:r0)/1e18).toFixed(4)} WBNB)`);
  } catch (e) {
    console.log(`${label}: ERROR -> ${e.shortMessage || e.message}`);
  }
}
