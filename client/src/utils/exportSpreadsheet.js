export function exportSpreadsheet(filename, headers, rows, sheetName = "Export") {
  const table = [
    `<tr>${headers.map((header) => `<th>${htmlCell(header)}</th>`).join("")}</tr>`,
    ...rows.map((row) => `<tr>${row.map((cell) => `<td>${htmlCell(cell)}</td>`).join("")}</tr>`)
  ].join("");
  const workbook = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; }
    th { background: #facc15; color: #111827; font-weight: 700; }
    th, td { border: 1px solid #94a3b8; padding: 6px 8px; white-space: nowrap; }
  </style>
</head>
<body>
  <table data-sheet-name="${htmlCell(sheetName)}">${table}</table>
</body>
</html>`;
  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/\.xlsx$/i, ".xls").endsWith(".xls") ? filename.replace(/\.xlsx$/i, ".xls") : `${filename}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function safeFilePart(value) {
  return String(value || "export").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "export";
}

function htmlCell(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
