import { createPublicClient, http } from "viem";
const bscTestnet = { id: 97, name: "BSC Testnet", nativeCurrency:{name:"tBNB",symbol:"tBNB",decimals:18}, rpcUrls:{default:{http:["https://bsc-testnet-rpc.publicnode.com"]}} };
const pub = createPublicClient({ chain: bscTestnet, transport: http() });

const checks = {
  "Lista ListaStakeManager (direccion mainnet)": "0x1adB950d8bB3dA4bE104211D5AB038628e477fE6",
  "Lista slisBNB (direccion mainnet)": "0xB0b84D294e0C75A6abe60171b70edEb2EFd14A1B",
};
for (const [label, addr] of Object.entries(checks)) {
  const code = await pub.getBytecode({ address: addr });
  console.log(`${label}: ${code && code !== "0x" ? "CONTRATO PRESENTE en testnet (raro)" : "SIN CODIGO en chain 97"}`);
}
