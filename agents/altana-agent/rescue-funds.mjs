import { config } from "dotenv";
import { createPublicClient, createWalletClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Carga explicita del .env de la wallet 1 (rota para Altana, pero con fondos reales)
config({ path: ".env.wallet1-broken", override: true });

const account = privateKeyToAccount(process.env.ADMIN_PRIVATE_KEY);
const TARGET = "0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb"; // wallet 2

const bscMainnet = {
  id: 56,
  name: "BSC",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: ["https://bsc-dataseed.bnbchain.org"] } },
};
const bscTestnet = {
  id: 97,
  name: "BSC Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: ["https://bsc-testnet-rpc.publicnode.com"] } },
};

async function rescue(chain, label, reserveWei) {
  const pub = createPublicClient({ chain, transport: http() });
  const wal = createWalletClient({ account, chain, transport: http() });

  const balance = await pub.getBalance({ address: account.address });
  console.log(`[${label}] balance origen (wallet1): ${formatEther(balance)} ${chain.nativeCurrency.symbol}`);

  if (balance <= reserveWei) {
    console.log(`[${label}] saldo insuficiente para mover, salto.`);
    return;
  }

  const gasPrice = await pub.getGasPrice();
  const gasLimit = 21000n;
  const gasCost = gasPrice * gasLimit;
  const sendAmount = balance - reserveWei - gasCost;

  if (sendAmount <= 0n) {
    console.log(`[${label}] tras reservar gas no queda nada que mover.`);
    return;
  }

  console.log(`[${label}] enviando ${formatEther(sendAmount)} ${chain.nativeCurrency.symbol} -> ${TARGET}`);
  const hash = await wal.sendTransaction({ to: TARGET, value: sendAmount, gas: gasLimit, gasPrice });
  console.log(`[${label}] tx: ${hash}`);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`[${label}] confirmada en bloque ${receipt.blockNumber}, status: ${receipt.status}`);

  const targetBalance = await pub.getBalance({ address: TARGET });
  console.log(`[${label}] balance destino (wallet2) ahora: ${formatEther(targetBalance)} ${chain.nativeCurrency.symbol}`);
}

console.log("Rescatando fondos de wallet1 (", account.address, ") -> wallet2 (", TARGET, ")\n");

await rescue(bscMainnet, "BSC Mainnet", 0n); // mover todo lo posible, solo reservar gas
console.log("");
await rescue(bscTestnet, "BSC Testnet", 0n);
