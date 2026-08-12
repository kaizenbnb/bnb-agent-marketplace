import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { writeFileSync } from "fs";

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log("Admin EOA (deployer):", account.address);

const client = createClient({ chains: [BNB_TESTNET] });
const signer = signerFromPrivateKey(privateKey);

const wallet = await client.createWallet({ signer });

console.log("Agentic wallet address:", wallet.address);
console.log("Chain: BNB Smart Chain Testnet (97)");

writeFileSync(
  ".env",
  `ADMIN_PRIVATE_KEY=${privateKey}\nWALLET_ADDRESS=${wallet.address}\nADMIN_EOA=${account.address}\n`
);

console.log("\nGuardado en .env (gitignored). Fondear WALLET_ADDRESS con tBNB antes del paso 2.");
