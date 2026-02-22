export type ExportFormat = "pdf" | "html" | "docx";

export interface PlanCapabilities {
  allowedExportFormats: ExportFormat[];
  canUseBranding: boolean;
  showWatermark: boolean;
  unlimitedAudits: boolean;
}

export function getPlanCapabilities(planId?: string | null): PlanCapabilities {
  const isAgency = planId === "agency";
  const isPro = planId === "pro";
  const isFree = planId === "free";

  return {
    allowedExportFormats: isAgency
      ? ["pdf", "html", "docx"]
      : isPro
      ? ["pdf", "html"]
      : ["pdf"],
    canUseBranding: isAgency,
    showWatermark: isFree,
    unlimitedAudits: isAgency || isPro,
  };
}

