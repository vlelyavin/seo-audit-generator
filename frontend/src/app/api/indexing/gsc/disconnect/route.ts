import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGoogleAccount } from "@/lib/google-auth";

/**
 * DELETE /api/indexing/gsc/disconnect
 * Disconnects GSC by clearing the expanded scope. Keeps OAuth tokens intact
 * so that Google sign-in continues to work.
 * Sites and data are preserved — user can reconnect anytime.
 * Auto-indexing via Google API pauses; IndexNow continues.
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getGoogleAccount(session.user.id);

  // Clear only the scope so hasRequiredScopes() returns false.
  if (account) {
    await prisma.account.update({
      where: { id: account.id },
      data: { scope: null },
    });
  }

  // Mark GSC as disconnected but preserve sites and data
  await prisma.user.update({
    where: { id: session.user.id },
    data: { gscConnected: false, gscConnectedAt: null },
  });

  return NextResponse.json({ success: true });
}
