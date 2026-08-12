import { createPublicClient, http } from "viem";
const USDT_OFFICIAL = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });

// Probar funciones comunes de faucet/mint publico
const candidates = [
  {name:"mint", abi:[{type:"function",name:"mint",stateMutability:"nonpayable",inputs:[{type:"address"},{type:"uint256"}],outputs:[]}]},
  {name:"mint(uint256)", abi:[{type:"function",name:"mint",stateMutability:"nonpayable",inputs:[{type:"uint256"}],outputs:[]}]},
  {name:"faucet", abi:[{type:"function",name:"faucet",stateMutability:"nonpayable",inputs:[],outputs:[]}]},
];

// Comprobar bytecode existe y tamano
const code = await pub.getBytecode({ address: USDT_OFFICIAL });
console.log("Bytecode presente:", !!code, "longitud:", code?.length);

// Intentar leer si es un proxy o tiene owner/nombre reconocible
try {
  const nameAbi = [{type:"function",name:"name",stateMutability:"view",inputs:[],outputs:[{type:"string"}]}];
  const name = await pub.readContract({ address: USDT_OFFICIAL, abi: nameAbi, functionName: "name" });
  console.log("name():", name);
} catch(e) { console.log("name() fallo:", e.shortMessage); }

try {
  const symAbi = [{type:"function",name:"symbol",stateMutability:"view",inputs:[],outputs:[{type:"string"}]}];
  const sym = await pub.readContract({ address: USDT_OFFICIAL, abi: symAbi, functionName: "symbol" });
  console.log("symbol():", sym);
} catch(e) { console.log("symbol() fallo:", e.shortMessage); }
