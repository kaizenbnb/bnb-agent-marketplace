import "dotenv/config";
import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";
import { encodeFunctionData } from "viem";
import { readFileSync } from "fs";

const VUSDT = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";
const USDT = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c";
const vusdtAbi = JSON.parse(readFileSync("./vusdt-abi.json", "utf-8"));
const usdtAbi = JSON.parse(readFileSync("./usdt-abi.json", "utf-8"));

const wallet = { address: process.env.WALLET_ADDRESS };
const adminSigner = signerFromPrivateKey(process.env.ADMIN_PRIVATE_KEY);
const client = createClient({ chains: [BNB_TESTNET] });

const repayAmount = 12959999n; // mismo monto del intento anterior

console.log("Probando approve+repayBorrow via PATH ADMIN (sin sesion scoped)...");
const approveCall = { to: USDT, value: 0n, data: encodeFunctionData({ abi: usdtAbi, functionName: "approve", args: [VUSDT, repayAmount] }) };
const repayCall = { to: VUSDT, value: 0n, data: encodeFunctionData({ abi: vusdtAbi, functionName: "repayBorrow", args: [repayAmount] }) };

try {
  const r = await client.execute({ wallet, signer: adminSigner, calls: [approveCall, repayCall] });
  console.log("EXITO via admin path:", r.status, r.transactionHash);
} catch (e) {
  console.log("FALLO tambien via admin path.");
  console.log("Reason:", e.details || e.shortMessage || e.message);
}
