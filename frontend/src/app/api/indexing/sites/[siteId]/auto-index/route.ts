import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/indexing/sites/[siteId]/auto-index
 * Toggle auto-indexing on/off per engine.
 * Body: { google?: boolean, bing?: boolean }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;
  const site = await prisma.site.findUnique({ where: { id: siteId } });

  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const body = await req.json();
  const update: { autoIndexGoogle?: boolean; autoIndexBing?: boolean } = {};

  if (typeof body.google === "boolean") update.autoIndexGoogle = body.google;
  if (typeof body.bing === "boolean") update.autoIndexBing = body.bing;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.site.update({
    where: { id: siteId },
    data: update,
  });

  return NextResponse.json({
    autoIndexGoogle: updated.autoIndexGoogle,
    autoIndexBing: updated.autoIndexBing,
  });
}
