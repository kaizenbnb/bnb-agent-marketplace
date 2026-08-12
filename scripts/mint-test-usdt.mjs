import { createClient, BNB_TESTNET, signerFromPrivateKey } from "@altananetwork/sdk";
import { encodeFunctionData, parseUnits } from "viem";

const USDT = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c";
const usdtAbi = [{ type: "function", name: "allocateTo", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] }];

const wallet = { address: process.env.WALLET_ADDRESS };
const adminSigner = signerFromPrivateKey(process.env.ADMIN_PRIVATE_KEY);
const client = createClient({ chains: [BNB_TESTNET] });

const amount = parseUnits("10", 6); // 10 real USDT, correct decimals
const call = { to: USDT, value: 0n, data: encodeFunctionData({ abi: usdtAbi, functionName: "allocateTo", args: [wallet.address, amount] }) };

const r = await client.execute({ wallet, signer: adminSigner, calls: [call] });
console.log("Minted 10 USDT, tx:", r.status, r.transactionHash);
