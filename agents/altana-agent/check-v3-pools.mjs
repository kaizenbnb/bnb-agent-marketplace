import { createPublicClient, http } from "viem";

const V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const BUSD = "0x78867BbEeF44f2326bF8DDd1941a4439382EF2A7";
const USDT_OFFICIAL = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";

const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });

const factoryAbi = [{type:"function", name:"getPool", stateMutability:"view", inputs:[{type:"address"},{type:"address"},{type:"uint24"}], outputs:[{type:"address"}]}];
const poolAbi = [
  {type:"function", name:"liquidity", stateMutability:"view", inputs:[], outputs:[{type:"uint128"}]},
  {type:"function", name:"slot0", stateMutability:"view", inputs:[], outputs:[
    {type:"uint160","name":"sqrtPriceX96"},{type:"int24","name":"tick"},{type:"uint16","name":"observationIndex"},
    {type:"uint16","name":"observationCardinality"},{type:"uint16","name":"observationCardinalityNext"},
    {type:"uint32","name":"feeProtocol"},{type:"bool","name":"unlocked"}
  ]},
  {type:"function", name:"token0", stateMutability:"view", inputs:[], outputs:[{type:"address"}]},
  {type:"function", name:"token1", stateMutability:"view", inputs:[], outputs:[{type:"address"}]},
  {type:"function", name:"tickSpacing", stateMutability:"view", inputs:[], outputs:[{type:"int24"}]},
];

const FEE_TIERS = [100, 500, 2500, 10000]; // 0.01%, 0.05%, 0.25%, 1%
const pairs = { "WBNB/BUSD": [WBNB, BUSD], "WBNB/USDT-oficial": [WBNB, USDT_OFFICIAL] };

for (const [label, [t0, t1]] of Object.entries(pairs)) {
  console.log(`\n=== ${label} ===`);
  for (const fee of FEE_TIERS) {
    const poolAddr = await pub.readContract({ address: V3_FACTORY, abi: factoryAbi, functionName: "getPool", args: [t0, t1, fee] });
    if (poolAddr === "0x0000000000000000000000000000000000000000") {
      console.log(`  fee=${fee/10000}%: sin pool`);
      continue;
    }
    try {
      const liquidity = await pub.readContract({ address: poolAddr, abi: poolAbi, functionName: "liquidity" });
      const slot0 = await pub.readContract({ address: poolAddr, abi: poolAbi, functionName: "slot0" });
      const tickSpacing = await pub.readContract({ address: poolAddr, abi: poolAbi, functionName: "tickSpacing" });
      console.log(`  fee=${fee/10000}%: pool=${poolAddr}`);
      console.log(`    liquidity=${liquidity.toString()}  tick=${slot0[1]}  tickSpacing=${tickSpacing}  unlocked=${slot0[6]}`);
    } catch (e) {
      console.log(`  fee=${fee/10000}%: pool=${poolAddr} pero ERROR leyendo estado -> ${e.shortMessage || e.message}`);
    }
  }
}
