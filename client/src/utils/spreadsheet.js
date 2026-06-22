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
  const fileBuffer = await file.arrayBuffer();
  try {
    await workbook.xlsx.load(fileBuffer);
  } catch (error) {
    const normalizedBuffer = await normalizeSpreadsheetNamespaces(fileBuffer);
    try {
      await workbook.xlsx.load(normalizedBuffer);
    } catch {
      throw new Error("This Excel file could not be read. Download a fresh template and upload it as an .xlsx file.", { cause: error });
    }
  }
  const sheet = workbook.worksheets.find((item) => !item.name.startsWith("_") && item.state === "visible")
    || workbook.worksheets.find((item) => !item.name.startsWith("_"))
    || workbook.worksheets[0];
  if (!sheet) return [];
  const headerRow = sheet.getRow(1);
  const columnCount = Math.max(sheet.actualColumnCount, headerRow.actualCellCount);
  if (!columnCount) return [];
  const headers = Array.from({ length: columnCount }, (_, index) => normalizeHeader(headerRow.getCell(index + 1), headerMap));
  return Array.from({ length: Math.max(0, sheet.actualRowCount - 1) }, (_, index) => sheet.getRow(index + 2))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, cellText(row.getCell(index + 1))])))
    .filter((row) => Object.values(row).some((value) => String(value).trim()));
}

async function loadExcelJS() {
  const mod = await import("exceljs");
  return mod.default || mod;
}

async function normalizeSpreadsheetNamespaces(buffer) {
  const mod = await import("jszip");
  const JSZip = mod.default || mod;
  const zip = await JSZip.loadAsync(buffer);
  const xmlEntries = Object.entries(zip.files).filter(([name, entry]) => !entry.dir && name.toLowerCase().endsWith(".xml"));
  await Promise.all(xmlEntries.map(async ([name, entry]) => {
    let xml = await entry.async("string");
    const namespaceMatch = xml.match(/xmlns:([A-Za-z_][\w.-]*)=["']http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main["']/);
    if (!namespaceMatch) return;
    const prefix = escapeRegExp(namespaceMatch[1]);
    xml = xml.replace(new RegExp(`<(/?)${prefix}:`, "g"), "<$1");
    zip.file(name, xml);
  }));
  return zip.generateAsync({ type: "uint8array" });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHeader(header, headerMap) {
  const key = cellText(header).trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
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
