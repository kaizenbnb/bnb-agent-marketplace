import "dotenv/config";
import { createPublicClient, http } from "viem";
const USDT_OFFICIAL = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });
const wallet = process.env.WALLET_ADDRESS;

const candidates = [
  {abi:[{type:"function",name:"allocateTo",stateMutability:"nonpayable",inputs:[{type:"address","name":"_owner"},{type:"uint256","name":"value"}],outputs:[]}], fn:"allocateTo", args:[wallet, 1000000000000000000n]},
  {abi:[{type:"function",name:"mint",stateMutability:"nonpayable",inputs:[{type:"address"},{type:"uint256"}],outputs:[]}], fn:"mint", args:[wallet, 1000000000000000000n]},
  {abi:[{type:"function",name:"mint",stateMutability:"nonpayable",inputs:[{type:"uint256"}],outputs:[]}], fn:"mint", args:[1000000000000000000n]},
  {abi:[{type:"function",name:"faucet",stateMutability:"nonpayable",inputs:[],outputs:[]}], fn:"faucet", args:[]},
  {abi:[{type:"function",name:"gimmeSome",stateMutability:"nonpayable",inputs:[],outputs:[]}], fn:"gimmeSome", args:[]},
];

for (const c of candidates) {
  try {
    await pub.simulateContract({ address: USDT_OFFICIAL, abi: c.abi, functionName: c.fn, args: c.args, account: wallet });
    console.log(`${c.fn}(${c.args.length} args): OK, no revierte -- funcion valida`);
  } catch (e) {
    console.log(`${c.fn}(${c.args.length} args): FALLA -> ${e.shortMessage || e.message?.slice(0,100)}`);
  }
}
