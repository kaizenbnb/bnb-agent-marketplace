import { NextResponse } from "next/server";
import { getConfigStatus, isConfigComplete } from "@/lib/config";

/**
 * Config readiness probe. Returns only booleans -- never the actual env var
 * values -- so this is safe to leave public and to check from a browser or
 * curl when diagnosing a broken deploy without needing Vercel dashboard access.
 */
export async function GET() {
  const status = getConfigStatus();
  return NextResponse.json({
    ready: isConfigComplete(status),
    config: status,
  });
}
