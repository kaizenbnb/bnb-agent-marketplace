import { createPublicClient, http } from "viem";

const V3_NPM = "0x427bF5b37357632377eCbEC9de3626C71A5396c1";
const npmAbi = [{
  type: "function", name: "positions", stateMutability: "view",
  inputs: [{ type: "uint256" }],
  outputs: [
    { type: "uint96" }, { type: "address" }, { type: "address" }, { type: "address" },
    { type: "uint24" }, { type: "int24" }, { type: "int24" },
    { type: "uint128" }, { type: "uint256" }, { type: "uint256" },
    { type: "uint128" }, { type: "uint128" },
  ],
}];

const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });

const pos = await pub.readContract({ address: V3_NPM, abi: npmAbi, functionName: "positions", args: [36782n] });
console.log("Posicion B (tokenId 36782) liquidez actual:", pos[7].toString());
console.log("(antes del hire de rebalancing era: 3155047326754856497)");
