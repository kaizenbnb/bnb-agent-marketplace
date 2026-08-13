import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getAgent } from "@/lib/agents";
import { build402Body, decodeXPayment, validatePermit2Authorization, settlePermit2Payment, HIRE_PRICE_USDT } from "@/lib/x402";
import { supplyToVenus, addCollateralToVenus } from "@/lib/venus";
import { fireGridSwap } from "@/lib/pancake";
import { growPositionB } from "@/lib/v3";
import { isConfigComplete } from "@/lib/config";

/**
 * The x402 "merchant" for hiring an agent. Real three-step handshake:
 *   1. POST without X-PAYMENT, body { beneficiary } -> 402 with payment
 *      requirements (accepts[]), quoting the server's own fixed price.
 *   2. POST with X-PAYMENT, same body:
 *      a. VALIDATE: read-only checks -- signature recovery, nonce unused,
 *         balance/allowance sufficient, deadline OK, signed amount matches
 *         what was quoted
 *      b. WORK: execute the agent's billable action, on behalf of the
 *         buyer-chosen `beneficiary` wallet (passed through for the audit
 *         trail; see the doWork implementations for today's limits)
 *      c. CAPTURE: only if work succeeds, settle the Permit2 payment to
 *         `agent.wallet` -- the same address quoted as `payTo` in the 402
 *         response, NEVER the buyer-supplied beneficiary (transferDetails.to
 *         is NOT part of what the user signs -- Permit2 only signs "spender
 *         may pull up to X", so letting a client-controlled value pick the
 *         destination would let a buyer redirect the payment to themselves)
 *      Returns BOTH transaction hashes on success. If work fails, payment is never settled.
 *
 * The signature itself is produced client-side by the user's own connected
 * wallet (wagmi's useSignTypedData) -- the server never holds or needs the
 * payer's key, only recovers and checks the signature it receives.
 *
 * Generalized one agent at a time, each verified end-to-end before the next
 * (see agents/AGENT_LOG.md for the underlying agent lessons).
 */

const WORK_ACTIONS: Record<string, (beneficiary: Address) => Promise<string>> = {
  "yield-venus-comparator": supplyToVenus,
  "health-factor-venus": addCollateralToVenus,
  "grid-pancakeswap-v2": fireGridSwap,
  "rebalancing-pancakeswap-v3": growPositionB,
};

// Simple in-memory rate limiter: tracks requests per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 3600000; // 1 hour

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= RATE_LIMIT_REQUESTS) {
    return false;
  }

  record.count++;
  return true;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  // Config check first: fail clean (503, no stack trace) instead of an
  // uncaught 500 deep inside signing/settlement when an env var is missing.
  if (!isConfigComplete()) {
    console.error("[hire] Server misconfigured: one or more required env vars are missing");
    return NextResponse.json(
      { error: "Server is not fully configured. Check /api/health for details." },
      { status: 503 }
    );
  }

  const ip = getClientIp(req);

  const agent = getAgent(agentId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const doWork = WORK_ACTIONS[agentId];
  if (!doWork) {
    return NextResponse.json(
      { error: "The x402 hire flow isn't wired up for this agent yet." },
      { status: 501 }
    );
  }

  // Body carries the buyer's chosen beneficiary wallet. The price is NOT
  // client-supplied -- HIRE_PRICE_USDT is the only amount the server will
  // ever quote or accept, regardless of what a request body claims. (It
  // used to accept a client `amount` field for both quoting and validation,
  // which meant a buyer could just declare their own price.)
  const requestBody = await req.json().catch(() => ({}));
  const amount = HIRE_PRICE_USDT;

  const beneficiary = requestBody.beneficiary;
  if (!beneficiary || !isAddress(beneficiary)) {
    return NextResponse.json({ error: "Invalid or missing beneficiary wallet address" }, { status: 400 });
  }

  const xPayment = req.headers.get("X-PAYMENT") ?? req.headers.get("PAYMENT-SIGNATURE");

  if (!xPayment) {
    const body = build402Body(
      agent.wallet as `0x${string}`,
      req.nextUrl.toString(),
      `Hire ${agent.name}`
    );
    return NextResponse.json(body, { status: 402 });
  }

  // Rate limit only real execution attempts (a payment header is present) --
  // the negotiation round-trip above just echoes the price back and touches
  // no chain state, so it shouldn't burn a buyer's quota before they've
  // signed anything.
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many hire attempts. Max 5 per hour per IP." },
      { status: 429 }
    );
  }

  let payload;
  try {
    payload = decodeXPayment(xPayment);
  } catch (err) {
    console.error("[hire] Invalid X-PAYMENT header:", String(err));
    return NextResponse.json(
      { error: "Invalid X-PAYMENT header" },
      { status: 400 }
    );
  }

  // Step 1: VALIDATE the authorization (read-only, no blockchain writes)
  try {
    await validatePermit2Authorization(payload, amount);
  } catch (err) {
    const errMsg = String(err);
    // Log server-side for debugging; send sanitized message to client
    console.error("[hire] Authorization validation failed:", errMsg);
    // Check for common failure patterns (insufficient balance, nonce used, etc.)
    if (errMsg.includes("Insufficient balance") || errMsg.includes("balance")) {
      return NextResponse.json(
        { error: "Insufficient balance to complete this hire" },
        { status: 402 }
      );
    }
    if (errMsg.includes("nonce") || errMsg.includes("used")) {
      return NextResponse.json(
        { error: "This payment authorization has already been used" },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { error: "Payment authorization is invalid" },
      { status: 402 }
    );
  }

  // Step 2: WORK — execute the agent's billable action, on behalf of beneficiary
  let workTxHash: string;
  try {
    workTxHash = await doWork(beneficiary as Address);
  } catch (err) {
    const errMsg = String(err);
    console.error(`[hire] Work action failed for ${agentId}:`, errMsg);
    // Check for out-of-gas condition
    if (errMsg.includes("gas") || errMsg.includes("out of") || errMsg.includes("insufficient")) {
      return NextResponse.json(
        {
          error: "Agent wallet is out of gas (tBNB). Work was not executed.",
          hint: "The agent wallet needs tBNB to execute transactions. See the agent details page for verified transactions.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "Agent work action failed before payment was captured. No charge has been made." },
      { status: 500 }
    );
  }

  // Step 3: CAPTURE — only if work succeeded, settle the payment to the
  // agent's OWN wallet (the same address quoted as `payTo` in the 402
  // response) -- never the buyer-supplied beneficiary, which would let a
  // buyer redirect the payment to an address of their own choosing.
  let paymentTxHash: string;
  try {
    paymentTxHash = await settlePermit2Payment(payload, agent.wallet as Address);
  } catch (err) {
    const errMsg = String(err);
    console.error("[hire] Payment settlement failed after work succeeded:", errMsg);
    return NextResponse.json(
      {
        error: "Work succeeded but payment settlement encountered an issue. Both transactions should be verified on chain.",
        work: { txHash: workTxHash },
        hint: "Contact support with both transaction hashes for resolution.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    status: "hired",
    agent: agent.name,
    payment: { txHash: paymentTxHash },
    work: { txHash: workTxHash },
  });
}
