import { csvToObjects } from "./csv.js";

export async function readImportFile(file, headerMap = {}) {
  if (!file) return [];
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return readXlsxObjects(file, headerMap);
  return csvToObjects(await file.text(), headerMap);
}

export async function downloadXlsxTemplate({ filename, sheetName, columns, sampleRows = [], dropdowns = {}, notes = [] }) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JCoins";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(columns);
  sampleRows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172033" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = Math.max(14, String(column).length + 4);
  });

  const lists = workbook.addWorksheet("_Dropdowns");
  lists.state = "hidden";
  const dropdownEntries = Object.entries(dropdowns).filter(([, values]) => values?.length);
  dropdownEntries.forEach(([name, values], listIndex) => {
    const columnIndex = listIndex + 1;
    lists.getCell(1, columnIndex).value = name;
    values.forEach((value, rowIndex) => {
      lists.getCell(rowIndex + 2, columnIndex).value = value;
    });
  });

  dropdownEntries.forEach(([name, values], listIndex) => {
    const columnIndex = columns.indexOf(name) + 1;
    if (!columnIndex) return;
    const listColumn = columnLetter(listIndex + 1);
    const formula = `'_Dropdowns'!$${listColumn}$2:$${listColumn}$${values.length + 1}`;
    for (let row = 2; row <= 301; row += 1) {
      sheet.getCell(row, columnIndex).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorStyle: "error",
        errorTitle: "Choose from the list",
        error: "Please choose an existing value from the dropdown."
      };
    }
  });

  if (notes.length) {
    const info = workbook.addWorksheet("Instructions");
    notes.forEach((note, index) => {
      info.getCell(index + 1, 1).value = note;
      info.getCell(index + 1, 1).alignment = { wrapText: true };
    });
    info.getColumn(1).width = 95;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(filename, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

async function readXlsxObjects(file, headerMap) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets.find((worksheet) => !worksheet.name.startsWith("_")) || workbook.worksheets[0];
  if (!sheet) return [];
  const headers = sheet.getRow(1).values.slice(1).map((header) => normalizeHeader(header, headerMap));
  const rows = [];
  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    const object = Object.fromEntries(headers.map((header, index) => [header, cellText(row.getCell(index + 1))]));
    if (Object.values(object).some((value) => String(value).trim())) rows.push(object);
  }
  return rows;
}

async function loadExcelJS() {
  const mod = await import("exceljs");
  return mod.default || mod;
}

function normalizeHeader(header, headerMap) {
  const key = String(cellText({ value: header }) || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return headerMap[key] || key;
}

function cellText(cell) {
  const value = cell?.text || cell?.value || "";
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return String(value.result ?? "");
    if ("text" in value) return String(value.text ?? "");
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
  }
  return String(value);
}

function columnLetter(index) {
  let value = "";
  while (index > 0) {
    const remainder = (index - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    index = Math.floor((index - 1) / 26);
  }
  return value;
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
