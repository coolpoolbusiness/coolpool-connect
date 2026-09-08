// Tiny client-side CSV export — no dependency. Builds a CSV from an array of
// plain objects and triggers a browser download.

function escapeCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  // Quote if the value contains a comma, quote, or newline; double inner quotes.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Download `rows` as a CSV file. `columns` fixes the header order and labels;
 * each column maps a row to a cell value.
 */
export function downloadCsv<T>(
  filename: string,
  columns: { header: string; value: (row: T) => unknown }[],
  rows: T[],
): void {
  const head = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escapeCell(c.value(r))).join(","))
    .join("\r\n");
  const csv = `${head}\r\n${body}`;
  // Prepend a BOM so Excel opens UTF-8 (₹, names) correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
