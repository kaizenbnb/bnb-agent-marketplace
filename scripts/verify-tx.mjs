import { createPublicClient, http } from "viem";
const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });

const hashes = JSON.parse(process.argv[2]);

for (const [label, hash] of Object.entries(hashes)) {
  try {
    const receipt = await pub.getTransactionReceipt({ hash });
    console.log(`${label}: status=${receipt.status} block=${receipt.blockNumber} to=${receipt.to} logs=${receipt.logs.length}`);
  } catch (e) {
    console.log(`${label}: ERROR -> ${e.shortMessage || e.message}`);
  }
}
