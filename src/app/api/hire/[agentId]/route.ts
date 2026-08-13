import { NextRequest, NextResponse } from "next/server";
import { parseEther } from "viem";
import { getAgent } from "@/lib/agents";
import { build402Body, decodeXPayment, validatePermit2Authorization, settlePermit2Payment } from "@/lib/x402";
import { supplyToVenus, addCollateralToVenus } from "@/lib/venus";
import { fireGridSwap } from "@/lib/pancake";
import { growPositionB, collectFeesPositionB } from "@/lib/v3";
import { isConfigComplete } from "@/lib/config";

/**
 * The x402 "merchant" for hiring an agent. Real three-step handshake:
 *   1. POST without X-PAYMENT -> 402 with payment requirements (accepts[]).
 *   2. POST with X-PAYMENT:
 *      a. VALIDATE: read-only checks (nonce unused, balance/allowance sufficient, deadline OK)
 *      b. WORK: execute the agent's billable action
 *      c. CAPTURE: only if work succeeds, settle the Permit2 payment
 *      Returns BOTH transaction hashes on success. If work fails, payment is never settled.
 *
 * Generalized one agent at a time, each verified end-to-end before the next
 * (see agents/AGENT_LOG.md for the underlying agent lessons).
 */

const WORK_ACTIONS: Record<string, () => Promise<string>> = {
  "yield-venus-comparator": supplyToVenus,
  "yield-venus-comparator-conservative": () => supplyToVenus(500_000n), // 0.5 USDT
  "health-factor-venus": addCollateralToVenus,
  "health-factor-venus-aggressive": addCollateralToVenus,
  "grid-pancakeswap-v2": fireGridSwap,
  "grid-pancakeswap-v2-wide": () => fireGridSwap(parseEther("0.02")), // 0.02 BNB
  "rebalancing-pancakeswap-v3": growPositionB,
  "rebalancing-pancakeswap-v3-harvest": collectFeesPositionB,
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

  // Rate limit: max 5 requests per IP per hour
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Max 5 hires per hour per IP." },
      { status: 429 }
    );
  }

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

  const xPayment = req.headers.get("X-PAYMENT") ?? req.headers.get("PAYMENT-SIGNATURE");

  if (!xPayment) {
    const body = build402Body(
      agent.wallet as `0x${string}`,
      req.nextUrl.toString(),
      `Hire ${agent.name}`
    );
    return NextResponse.json(body, { status: 402 });
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
    await validatePermit2Authorization(payload);
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

  // Step 2: WORK — execute the agent's billable action
  let workTxHash: string;
  try {
    workTxHash = await doWork();
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

  // Step 3: CAPTURE — only if work succeeded, settle the payment
  let paymentTxHash: string;
  try {
    paymentTxHash = await settlePermit2Payment(payload, agent.wallet as `0x${string}`);
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
