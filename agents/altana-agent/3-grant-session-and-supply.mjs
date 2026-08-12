import "dotenv/config";
import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";
import { encodeFunctionData, parseUnits } from "viem";
import { readFileSync, writeFileSync } from "fs";

const USDT_ADDRESS = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c";
const VUSDT_ADDRESS = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";

const usdtAbi = JSON.parse(readFileSync("./usdt-abi.json", "utf-8"));
const vusdtAbi = JSON.parse(readFileSync("./vusdt-abi.json", "utf-8"));

const wallet = { address: process.env.WALLET_ADDRESS };
const adminSigner = signerFromPrivateKey(process.env.ADMIN_PRIVATE_KEY);

const client = createClient({ chains: [BNB_TESTNET] });

// --- Paso 4: grant_session -------------------------------------------------
console.log("=== Paso 4: grant_session ===");
console.log("Politica: solo puede llamar a USDT y vUSDT (Venus core pool), cap 0.05 tBNB/dia, expira en 7 dias");

const session = await client.grantSession({
  wallet,
  signer: adminSigner,
  permissions: {
    calls: [{ to: USDT_ADDRESS }, { to: VUSDT_ADDRESS }],
    spend: [{ limit: parseUnits("0.05", 18), period: "day" }], // native tBNB, solo formal (calls llevan value=0)
  },
  expiry: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
});

console.log("Session key (publica):", session.publicKey);
console.log("Expira:", new Date(session.expiry * 1000).toISOString());

writeFileSync(
  "session.json",
  JSON.stringify(
    { publicKey: session.publicKey, expiry: session.expiry, walletAddress: session.walletAddress },
    null,
    2
  )
);

// --- Paso 5: execute supply (approve + mint) --------------------------------
console.log("\n=== Paso 5: play 'supply' (100 USDT en Venus) ===");

const amount = parseUnits("100", 18);

const approveCall = {
  to: USDT_ADDRESS,
  value: 0n,
  data: encodeFunctionData({ abi: usdtAbi, functionName: "approve", args: [VUSDT_ADDRESS, amount] }),
};
const mintCall = {
  to: VUSDT_ADDRESS,
  value: 0n,
  data: encodeFunctionData({ abi: vusdtAbi, functionName: "mint", args: [amount] }),
};

const result = await client.execute({
  session,
  calls: [approveCall, mintCall],
});

console.log("Tx status:", result.status);
console.log("Tx hash:", result.transactionHash);
console.log("callsId:", result.callsId);
