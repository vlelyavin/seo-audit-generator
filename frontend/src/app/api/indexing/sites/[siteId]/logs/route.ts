import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 25;

const ACTION_LABELS: Record<string, string> = {
  submitted_google: "Submitted to Google",
  submitted_indexnow: "Submitted to Bing",
  failed: "Submission failed",
  url_discovered: "New page discovered",
  url_removed: "Page removed from sitemap",
  url_404: "404 detected",
};

/**
 * GET /api/indexing/sites/[siteId]/logs
 * Returns paginated IndexingLog entries for a site.
 * Query params:
 *   page      - 1-based page number (default: 1)
 *   action    - filter by action ("all" or a specific action key)
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

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const action = url.searchParams.get("action") ?? "all";

  // Match logs that belong to this site via either the siteId column (new)
  // or via the indexedUrl relation (legacy entries written before this column existed).
  const siteFilter =
    action === "all"
      ? {
          OR: [
            { siteId },
            { indexedUrl: { siteId } },
          ],
        }
      : {
          action,
          OR: [
            { siteId },
            { indexedUrl: { siteId } },
          ],
        };

  const [logs, total] = await Promise.all([
    prisma.indexingLog.findMany({
      where: siteFilter,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        indexedUrl: { select: { url: true } },
      },
    }),
    prisma.indexingLog.count({ where: siteFilter }),
  ]);

  return NextResponse.json({
    logs: logs.map((log) => {
      let parsedDetails: Record<string, unknown> = {};
      try {
        parsedDetails = JSON.parse(log.details ?? "{}");
      } catch {
        /* ignore */
      }
      return {
        id: log.id,
        action: log.action,
        label: ACTION_LABELS[log.action] ?? log.action,
        url: log.indexedUrl?.url ?? (parsedDetails.url as string | undefined) ?? null,
        details: parsedDetails,
        createdAt: log.createdAt,
      };
    }),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
    availableActions: Object.keys(ACTION_LABELS),
  });
}
