"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TableData } from "@/types/audit";

interface AnalyzerTableProps {
  table: TableData;
}

export function AnalyzerTable({ table }: AnalyzerTableProps) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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
        <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          {table.title}
        </h4>
      )}
      <div className="overflow-x-auto rounded-lg border dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
              {headers.map((h, i) => (
                <th
                  key={i}
                  onClick={() => handleSort(i)}
                  className="cursor-pointer whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
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
                className="border-b last:border-0 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300"
                  >
                    {renderCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {sortedRows.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-gray-400">
            No data
          </div>
        )}
      </div>
    </div>
  );
}

function renderCell(val: string | number | boolean | null) {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") {
    return val ? (
      <span className="text-green-600 dark:text-green-400">Yes</span>
    ) : (
      <span className="text-red-600 dark:text-red-400">No</span>
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
        className="max-w-[300px] truncate text-gray-900 underline dark:text-white block"
      >
        {str}
      </a>
    );
  }
  return str;
}
