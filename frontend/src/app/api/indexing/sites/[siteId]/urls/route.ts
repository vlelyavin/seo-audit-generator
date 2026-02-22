import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const PAGE_SIZE = 50;

/**
 * GET /api/indexing/sites/[siteId]/urls
 * Returns a paginated list of URLs for a site.
 * Query params:
 *   - status: "all" | "indexed" | "not_indexed" | "submitted" | "failed" | "404"
 *   - page: number (1-based)
 *   - q: URL substring filter
 */
export async function GET(
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

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "all";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const q = searchParams.get("q") ?? "";

  const where: Prisma.IndexedUrlWhereInput = {
    siteId,
  };

  if (status === "indexed") {
    where.gscStatus = { in: ["Submitted and indexed", "Indexed"] };
  } else if (status === "not_indexed") {
    where.gscStatus = { notIn: ["Submitted and indexed", "Indexed"] };
  } else if (status === "submitted") {
    where.indexingStatus = "submitted";
  } else if (status === "failed") {
    where.indexingStatus = "failed";
  } else if (status === "404") {
    where.httpStatus = { in: [404, 410] };
  }

  if (q) {
    where.url = { contains: q };
  }

  const [total, urls] = await Promise.all([
    prisma.indexedUrl.count({ where }),
    prisma.indexedUrl.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        url: true,
        gscStatus: true,
        indexingStatus: true,
        submissionMethod: true,
        submittedAt: true,
        lastSyncedAt: true,
        httpStatus: true,
        errorMessage: true,
      },
    }),
  ]);

  return NextResponse.json({
    urls,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
  });
}
