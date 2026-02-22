import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGoogleAccount, hasRequiredScopes } from "@/lib/google-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/indexing/gsc/status
 * Returns the user's GSC connection status, connected email, and granted scopes.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getGoogleAccount(session.user.id);
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, gscConnected: true, gscConnectedAt: true },
  });

  if (!account) {
    return NextResponse.json({
      connected: false,
      hasRequiredScopes: false,
      email: user?.email ?? null,
      scopes: [],
      connectedAt: null,
    });
  }

  const scopes = account.scope ? account.scope.split(" ") : [];
  const scopesOk = hasRequiredScopes(account.scope);

  return NextResponse.json({
    connected: user?.gscConnected ?? false,
    hasRequiredScopes: scopesOk,
    email: user?.email ?? null,
    scopes,
    connectedAt: user?.gscConnectedAt ?? null,
  });
}
