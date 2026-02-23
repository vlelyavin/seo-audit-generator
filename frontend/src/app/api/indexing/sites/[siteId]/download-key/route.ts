import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/indexing/sites/[siteId]/download-key
 * Returns the IndexNow key file as a downloadable .txt file.
 */
export async function GET(
  _req: Request,
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

  if (!site.indexnowKey) {
    return NextResponse.json({ error: "No IndexNow key configured" }, { status: 400 });
  }

  return new NextResponse(site.indexnowKey, {
    headers: {
      "Content-Type": "text/plain",
      "Content-Disposition": `attachment; filename="${site.indexnowKey}.txt"`,
    },
  });
}
