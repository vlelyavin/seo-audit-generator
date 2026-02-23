import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGoogleAccount } from "@/lib/google-auth";

/**
 * DELETE /api/indexing/gsc/disconnect
 * Disconnects GSC by clearing the expanded scope. Keeps OAuth tokens intact
 * so that Google sign-in continues to work.
 * Query params:
 *   - deleteData: "true" (default) deletes all sites + URLs; "false" keeps data (OAuth only)
 */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const deleteData = searchParams.get("deleteData") !== "false";

  const account = await getGoogleAccount(session.user.id);

  // Clear only the scope so hasRequiredScopes() returns false.
  // Do NOT revoke the token or clear access_token/refresh_token — those are
  // needed by the NextAuth Google OAuth provider for sign-in.
  if (account) {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        scope: null,
      },
    });
  }

  // Clear GSC state; optionally wipe sites + URLs
  if (deleteData) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: { gscConnected: false, gscConnectedAt: null },
      }),
      prisma.site.deleteMany({ where: { userId: session.user.id } }),
    ]);
  } else {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { gscConnected: false, gscConnectedAt: null },
    });
  }

  return NextResponse.json({ success: true });
}
