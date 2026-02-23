"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TableData } from "@/types/audit";

interface AnalyzerTableProps {
  table: TableData;
}

export function AnalyzerTable({ table }: AnalyzerTableProps) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const t = useTranslations("audit");

  const headers = table.headers || [];
  // Convert dict rows to arrays (backend compatibility)
  const rawRows = table.rows || [];
  const rows = rawRows.map((row) => {
    if (Array.isArray(row)) return row;
    // row is an object - convert to array based on headers order
    return headers.map((header) => (row as Record<string, unknown>)[header] as string | number | boolean | null);
  });

  function handleSort(colIndex: number) {
    if (sortCol === colIndex) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(colIndex);
      setSortDir("asc");
    }
  }

  const sortedRows =
    sortCol !== null
      ? [...rows].sort((a, b) => {
          const aVal = a[sortCol];
          const bVal = b[sortCol];
          if (aVal == null) return 1;
          if (bVal == null) return -1;
          if (typeof aVal === "number" && typeof bVal === "number") {
            return sortDir === "asc" ? aVal - bVal : bVal - aVal;
          }
          const aStr = String(aVal);
          const bStr = String(bVal);
          return sortDir === "asc"
            ? aStr.localeCompare(bStr)
            : bStr.localeCompare(aStr);
        })
      : rows;

  if (headers.length === 0 && rows.length === 0) return null;

  return (
    <div>
      {table.title && (
        <h4 className="mb-2 text-sm font-medium text-gray-200">
          {table.title}
        </h4>
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-t border-gray-700 bg-gray-800">
              {headers.map((h, i) => (
                <th
                  key={i}
                  onClick={() => handleSort(i)}
                  className="cursor-pointer whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-400 hover:text-gray-200"
                >
                  <span className="flex items-center gap-1">
                    {h}
                    <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-gray-700 last:border-0 hover:bg-gray-800/50"
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-200"
                  >
                    {renderCell(cell, t)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {sortedRows.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-gray-400">
            {t("noData")}
          </div>
        )}
      </div>
    </div>
  );
}

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block align-middle"><circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 16 10"/></svg>
);

const IconCross = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block align-middle"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
);

const IconWarning = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block align-middle"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
);

const ICON_MAP: Record<string, () => React.JSX.Element> = {
  "\u2713": IconCheck,    // ✓
  "\u2714": IconCheck,    // ✔
  "\u2717": IconCross,    // ✗
  "\u2718": IconCross,    // ✘
  "\u2716": IconCross,    // ✖
  "\u26a0\ufe0f": IconWarning, // ⚠️
  "\u26a0": IconWarning,  // ⚠
};

const ICON_PATTERN = /[\u2713\u2714\u2717\u2718\u2716]|\u26a0\ufe0f?/g;

function renderCellWithIcons(str: string) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ICON_PATTERN.exec(str)) !== null) {
    if (match.index > lastIndex) {
      parts.push(str.slice(lastIndex, match.index));
    }
    const IconComponent = ICON_MAP[match[0]];
    if (IconComponent) {
      parts.push(<IconComponent key={match.index} />);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < str.length) {
    parts.push(str.slice(lastIndex));
  }

  return <span className="inline-flex items-center gap-0.5">{parts}</span>;
}

function renderCell(val: string | number | boolean | null, t: (key: string) => string) {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") {
    return val ? (
      <span className="text-green-400">{t("yes")}</span>
    ) : (
      <span className="text-red-400">{t("no")}</span>
    );
  }
  const str = String(val);
  // URL detection
  if (str.startsWith("http://") || str.startsWith("https://")) {
    return (
      <a
        href={str}
        target="_blank"
        rel="noopener noreferrer"
        className="max-w-[200px] sm:max-w-[300px] truncate text-gray-300 underline hover:text-copper block"
      >
        {str}
      </a>
    );
  }
  // Replace ✓/✗/⚠️ with SVG icons
  if (ICON_PATTERN.test(str)) {
    ICON_PATTERN.lastIndex = 0;
    return renderCellWithIcons(str);
  }
  return str;
}
