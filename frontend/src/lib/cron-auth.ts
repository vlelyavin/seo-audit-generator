import crypto from "crypto";
import { NextResponse } from "next/server";

/**
 * Verify the cron secret from the Authorization header.
 * Returns null if auth passes, or a NextResponse error to return immediately.
 *
 * - Rejects with 500 if CRON_SECRET env var is not configured.
 * - Uses crypto.timingSafeEqual to prevent timing attacks.
 */
export function verifyCronAuth(req: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const secretBuf = Buffer.from(cronSecret);
  const tokenBuf = Buffer.from(token);

  if (
    secretBuf.length !== tokenBuf.length ||
    !crypto.timingSafeEqual(secretBuf, tokenBuf)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
