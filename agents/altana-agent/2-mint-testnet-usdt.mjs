import "dotenv/config";
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";

const USDT_ADDRESS = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c"; // Venus mock USDT, BSC testnet
const usdtAbi = JSON.parse(readFileSync("./usdt-abi.json", "utf-8"));

const BNB_TESTNET_RPC = "https://bsc-testnet-rpc.publicnode.com";
const bscTestnet = {
  id: 97,
  name: "BSC Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: [BNB_TESTNET_RPC] } },
};

const account = privateKeyToAccount(process.env.ADMIN_PRIVATE_KEY);
const walletAddr = process.env.WALLET_ADDRESS;

const publicClient = createPublicClient({ chain: bscTestnet, transport: http() });
const walletClient = createWalletClient({ account, chain: bscTestnet, transport: http() });

const amount = parseUnits("100", 18); // 100 USDT, 18 decimales (BSC-USD)

console.log("Solicitando 100 USDT de test via allocateTo() ->", walletAddr);

const hash = await walletClient.writeContract({
  address: USDT_ADDRESS,
  abi: usdtAbi,
  functionName: "allocateTo",
  args: [walletAddr, amount],
});

console.log("Tx enviada:", hash);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("Confirmada en bloque:", receipt.blockNumber.toString(), "status:", receipt.status);

const balance = await publicClient.readContract({
  address: USDT_ADDRESS,
  abi: usdtAbi,
  functionName: "balanceOf",
  args: [walletAddr],
});
console.log("Balance USDT actual:", (Number(balance) / 1e18).toFixed(2), "USDT");
