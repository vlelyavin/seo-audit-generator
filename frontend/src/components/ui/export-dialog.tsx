"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ExportFormat } from "@/lib/plan-capabilities";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (format: string, lang: string) => void;
  loading?: boolean;
  defaultLang?: string;
  formatOptions?: ExportFormat[];
}

const ALL_FORMAT_OPTIONS: Record<ExportFormat, string> = {
  pdf: "PDF",
  html: "HTML", // Not offered in any plan — kept for potential future re-enabling
  docx: "DOCX",
  json: "JSON",
  csv: "CSV",
};

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "uk", label: "Українська" },
  { value: "ru", label: "Русский" },
];

export function ExportDialog({
  open,
  onClose,
  onExport,
  loading = false,
  defaultLang = "en",
  formatOptions,
}: ExportDialogProps) {
  const t = useTranslations("audit");
  const resolvedFormatOptions =
    formatOptions && formatOptions.length > 0 ? formatOptions : (["pdf", "html", "docx"] as ExportFormat[]);
  const [format, setFormat] = useState<ExportFormat>(() => resolvedFormatOptions[0]);
  const [lang, setLang] = useState(defaultLang);
  const selectedFormat = resolvedFormatOptions.includes(format)
    ? format
    : resolvedFormatOptions[0];

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 mx-5 w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon */}
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-copper/10">
          <Download className="h-6 w-6 text-copper" />
        </div>

        {/* Title */}
        <h3 className="mb-2 text-lg font-semibold text-white">
          {t("exportDialogTitle")}
        </h3>

        {/* Message */}
        <p className="mb-5 text-sm text-gray-400">
          {t("exportDialogMessage")}
        </p>

        {/* Format select */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-300">
            {t("exportFormat")}
          </label>
          <select
            value={selectedFormat}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            disabled={loading}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-copper focus:ring-2 focus:ring-copper/20 disabled:opacity-50"
          >
            {resolvedFormatOptions.map((opt) => (
              <option key={opt} value={opt}>
                {ALL_FORMAT_OPTIONS[opt]}
              </option>
            ))}
          </select>
        </div>

        {/* Language select — not shown for data formats (JSON/CSV) */}
        {selectedFormat !== "json" && selectedFormat !== "csv" && (
          <div className="mb-6">
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              {t("exportLanguage")}
            </label>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-copper focus:ring-2 focus:ring-copper/20 disabled:opacity-50"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {/* Spacer to maintain layout when language is hidden */}
        {(selectedFormat === "json" || selectedFormat === "csv") && (
          <div className="mb-6" />
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => onExport(selectedFormat, lang)}
            disabled={loading}
            className="flex-1 rounded-md bg-gradient-to-r from-copper to-copper-light px-4 py-2 text-xs font-semibold whitespace-nowrap text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t("generating", { format: selectedFormat.toUpperCase() })}
              </span>
            ) : (
              t("exportDownload")
            )}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-gray-700 px-4 py-2 text-xs font-medium text-gray-300 hover:bg-gray-800"
          >
            {t("cancel")}
          </button>
        </div>

        {/* Generation hint */}
        {loading && (
          <p className="mt-3 text-center text-xs text-gray-500">
            {t("exportGeneratingHint")}
          </p>
        )}
      </div>
    </div>
  );
}
