import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/indexing/sites/[siteId]
 * Delete a site and all related data (URLs, logs, reports).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
  });

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  if (site.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cascade delete: IndexedUrl and DailyReport have onDelete: Cascade in schema,
  // but IndexingLog references IndexedUrl, so delete in correct order.
  await prisma.$transaction([
    prisma.indexingLog.deleteMany({
      where: { indexedUrl: { siteId } },
    }),
    prisma.indexedUrl.deleteMany({
      where: { siteId },
    }),
    prisma.dailyReport.deleteMany({
      where: { siteId },
    }),
    prisma.site.delete({
      where: { id: siteId },
    }),
  ]);

  return NextResponse.json({ success: true });
}
