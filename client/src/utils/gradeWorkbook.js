const NAVY = "FF111A2D";
const GOLD = "FFFFC928";
const PALE_GOLD = "FFFFF3C4";
const WHITE = "FFFFFFFF";
const BORDER = "FF94A3B8";

export function isGrade12SectionName(section = "") {
  const value = String(section || "").trim().toLowerCase();
  return /(?:^|\b)(?:grade|g)\s*[- ]?\s*12(?:\b|\s)|\b12(?:th)?\s*(?:grade|year)\b/.test(value);
}

export function buildGradeWorkbookModel(data, activeClass, summaries) {
  const rows = [...summaries].sort((a, b) => String(a.studentName).localeCompare(String(b.studentName), undefined, { sensitivity: "base" }));
  const records = recordsForClass(data, activeClass);
  const grade12 = isGrade12SectionName(activeClass.section);
  const title = `${activeClass.subjectName} - ${activeClass.sectionLabel} Grades`;
  const sheets = [buildInputSheet(data, activeClass, rows.length, grade12), buildSummarySheet(activeClass, rows, grade12)];
  if (grade12) {
    sheets.push(buildDetailSheet(activeClass, rows, records, {
      name: "Prelim-Midterm",
      title: "Grade 1 - Prelim and Midterm",
      examPeriods: ["prelim", "midterm", "unassigned"],
      gradeKey: "first"
    }));
    sheets.push(buildDetailSheet(activeClass, rows, records, {
      name: "Prefinals-Finals",
      title: "Grade 2 - Pre-Finals and Finals",
      examPeriods: ["prefinals", "finals", "unassigned"],
      gradeKey: "second"
    }));
  } else {
    sheets.push(buildDetailSheet(activeClass, rows, records, {
      name: "Grade Record",
      title: "Complete Grade Record",
      examPeriods: null,
      gradeKey: null
    }));
  }
  return { title, subjectId: activeClass.subjectId, section: activeClass.section, sheets };
}

export async function downloadGradeWorkbook(data, activeClass, summaries) {
  const model = buildGradeWorkbookModel(data, activeClass, summaries);
  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JCoins Arena";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = model.title;
  model.sheets.forEach((sheetModel) => addWorksheet(workbook, sheetModel));
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(`${safeFilePart(model.title)}.xlsx`, buffer);
  return model;
}

function recordsForClass(data, activeClass) {
  const sameClass = (item) => item.subjectId === activeClass.subjectId && String(item.section || "").trim() === activeClass.section;
  return {
    writtenWorks: (data.writtenWorks || []).filter(sameClass).sort(byDate),
    quizzes: (data.quizzes || []).filter(sameClass).filter(quizCountsInGrades).sort(byDate),
    activities: (data.activities || []).filter((item) => item.subjectId === activeClass.subjectId && (!String(item.section || "").trim() || String(item.section || "").trim() === activeClass.section)).sort(byDate),
    groupActivities: (data.groupActivities || []).filter(sameClass).sort(byDate),
    majorExams: (data.majorExams || []).filter(sameClass).sort(byDate)
  };
}

function buildInputSheet(data, activeClass, studentCount, grade12) {
  const setting = (data.gradeSettings || []).find((item) => item.subjectId === activeClass.subjectId && String(item.section || "").trim() === activeClass.section);
  const weights = setting?.weights || data.settings?.grades?.weights || {};
  const rows = [
    ["JCoins Arena Grade Export"],
    [],
    ["Subject", activeClass.subjectName],
    ["Section", activeClass.sectionLabel],
    ["Grade Structure", grade12 ? "Grade 12 - two grades" : "College / standard - one overall grade"],
    ["Students", studentCount],
    ["Generated", new Date().toLocaleString()],
    [],
    ["Category", "Weight"],
    ["Written Works", Number(weights.writtenWorks || 0) / 100],
    ["Quizzes", Number(weights.quizzes || 0) / 100],
    ["Activities / Performance Tasks", Number(weights.activities || 0) / 100],
    ["Attendance", Number(weights.attendance || 0) / 100],
    ["Major Exams", Number(weights.majorExams || 0) / 100],
    [],
    ["Notes"],
    [grade12 ? "Written works, quizzes, activities, and attendance are shared by both Grade 12 results. Grade 1 uses Prelim and Midterm exams; Grade 2 uses Pre-Finals and Finals exams." : "This workbook contains one overall JCoins grade per student."],
    ["An unassigned Grade 12 major exam is included in both results until its grading period is selected in JCoins."],
    ["This is a one-way snapshot from JCoins. Use Sync to Google Drive again after changing scores."]
  ];
  return {
    name: "INPUT",
    rows,
    freezeRows: 1,
    freezeColumns: 0,
    headerRows: [1, 9, 16],
    gradeColumns: [],
    percentColumns: [2],
    merges: [merge(1, 1, 1, 2), merge(16, 1, 16, 2), merge(17, 1, 17, 2), merge(18, 1, 18, 2), merge(19, 1, 19, 2)]
  };
}

function buildSummarySheet(activeClass, summaries, grade12) {
  const headers = grade12
    ? ["No.", "Student", "Grade 1: Prelim + Midterm", "Grade 2: Pre-Finals + Finals", "Status", "Missing Requirements"]
    : ["No.", "Student", "JCoins Grade", "Status", "Missing Requirements"];
  const rows = [
    [`${activeClass.subjectName} - ${activeClass.sectionLabel}`],
    [grade12 ? "Grade 12 Two-Grade Summary" : "Grade Summary"],
    [],
    headers,
    ...summaries.map((summary, index) => grade12 ? [
      index + 1,
      summary.studentName,
      gradeValue(summary.grade12Grades?.first),
      gradeValue(summary.grade12Grades?.second),
      grade12Status(summary),
      (summary.missingItems || []).join(", ")
    ] : [
      index + 1,
      summary.studentName,
      Number(summary.currentGrade || 0),
      summary.riskStatus || "",
      (summary.missingItems || []).join(", ")
    ])
  ];
  return {
    name: "SUMMARY",
    rows,
    freezeRows: 4,
    freezeColumns: 2,
    headerRows: [1, 2, 4],
    gradeColumns: grade12 ? [3, 4] : [3],
    percentColumns: grade12 ? [3, 4] : [3],
    merges: [merge(1, 1, 1, headers.length), merge(2, 1, 2, headers.length)]
  };
}

function buildDetailSheet(activeClass, summaries, records, options) {
  const exams = options.examPeriods
    ? records.majorExams.filter((exam) => options.examPeriods.includes(normalizeExamPeriod(exam)))
    : records.majorExams;
  const columns = [
    { label: "No.", value: (_, index) => index + 1 },
    { label: "Student", value: (summary) => summary.studentName }
  ];
  const groups = [];
  addRecordGroup(columns, groups, "Written Works", records.writtenWorks, writtenWorkColumn, (summary) => percentValue(summary.categories?.writtenWorks));
  addRecordGroup(columns, groups, "Quizzes", records.quizzes, quizColumn, (summary) => percentValue(summary.categories?.quizzes));
  addRecordGroup(columns, groups, "Activities / Performance Tasks", [...records.activities.map(activityColumn), ...records.groupActivities.map(groupActivityColumn)], null, (summary) => percentValue(summary.categories?.activities), true);
  addSingleColumnGroup(columns, groups, "Attendance", "Attendance %", (summary) => percentValue(summary.categories?.attendance));
  addRecordGroup(columns, groups, "Major Exams", exams, examColumn, (summary) => options.gradeKey ? percentValue(summary.grade12Grades?.[options.gradeKey]?.examPercent) : percentValue(summary.categories?.majorExams));
  const gradeStart = columns.length + 1;
  if (options.gradeKey) {
    columns.push({ label: options.gradeKey === "first" ? "Grade 1" : "Grade 2", value: (summary) => gradeValue(summary.grade12Grades?.[options.gradeKey]) });
  } else if (summaries.some((summary) => summary.transmutation?.active)) {
    columns.push({ label: "Raw Grade", value: (summary) => Number(summary.rawGrade ?? summary.currentGrade ?? 0) });
    columns.push({ label: "Final Grade", value: (summary) => Number(summary.finalGrade ?? summary.currentGrade ?? 0) });
  } else {
    columns.push({ label: "JCoins Grade", value: (summary) => Number(summary.currentGrade || 0) });
  }
  groups.push({ label: "JCoins Result", start: gradeStart, end: columns.length });
  const groupRow = Array(columns.length).fill("");
  groups.forEach((group) => { groupRow[group.start - 1] = group.label; });
  const rows = [
    [`${activeClass.subjectName} - ${activeClass.sectionLabel}`],
    [options.title],
    groupRow,
    columns.map((column) => column.label),
    ...summaries.map((summary, index) => columns.map((column) => normalizeCell(column.value(summary, index))))
  ];
  return {
    name: options.name,
    rows,
    freezeRows: 4,
    freezeColumns: 2,
    headerRows: [1, 2, 3, 4],
    gradeColumns: Array.from({ length: columns.length - gradeStart + 1 }, (_, index) => gradeStart + index),
    percentColumns: columns.map((column, index) => /%|Grade/.test(column.label) ? index + 1 : 0).filter(Boolean),
    merges: [merge(1, 1, 1, columns.length), merge(2, 1, 2, columns.length), ...groups.filter((group) => group.end > group.start).map((group) => merge(3, group.start, 3, group.end))]
  };
}

function addRecordGroup(columns, groups, label, records, mapper, summaryValue, preMapped = false) {
  const start = columns.length + 1;
  if (preMapped) records.forEach((column) => columns.push(column));
  else records.forEach((record) => columns.push(mapper(record)));
  columns.push({ label: `${label} %`, value: summaryValue });
  groups.push({ label, start, end: columns.length });
}

function addSingleColumnGroup(columns, groups, label, columnLabel, value) {
  const start = columns.length + 1;
  columns.push({ label: columnLabel, value });
  groups.push({ label, start, end: start });
}

function writtenWorkColumn(work) {
  return {
    label: `${work.title}\nMax ${work.maxScore}`,
    value: (summary) => {
      const row = (work.rows || []).find((item) => item.studentId === summary.studentId);
      return row?.recorded ? Number(row.score || 0) : "";
    }
  };
}

function quizColumn(quiz) {
  const maximum = Number(quiz.totalItems || quiz.questions?.length || quiz.rows?.find((row) => row.total)?.total || 0);
  return {
    label: `${quiz.title}\nMax ${maximum || "-"}`,
    value: (summary) => {
      const row = (quiz.rows || []).find((item) => item.studentId === summary.studentId);
      return Number(row?.attempts || 0) > 0 ? Number(row.bestScore || 0) : "";
    }
  };
}

function activityColumn(activity) {
  return {
    label: `${activity.title}\nMax 100`,
    value: (summary) => {
      const row = (activity.rows || []).find((item) => item.studentId === summary.studentId);
      return row?.submitted && row.score !== "" && row.score != null ? Number(row.score) : "";
    }
  };
}

function groupActivityColumn(activity) {
  return {
    label: `${activity.title}\nMax 100`,
    value: (summary) => {
      const guild = (activity.guildRows || []).find((row) => (row.members || []).some((member) => member.studentId === summary.studentId));
      const value = guild?.memberGrades?.[summary.studentId];
      return value === "" || value == null ? "" : Number(value);
    }
  };
}

function examColumn(exam) {
  return {
    label: `${exam.title}\nMax ${exam.maxScore}`,
    value: (summary) => {
      const row = (exam.rows || []).find((item) => item.studentId === summary.studentId);
      return row?.recorded ? Number(row.score || 0) : "";
    }
  };
}

function normalizeExamPeriod(exam) {
  const value = String(exam.gradingPeriod || "").toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "prelim" || value === "preliminary") return "prelim";
  if (value === "midterm" || value === "midterms") return "midterm";
  if (value === "prefinal" || value === "prefinals") return "prefinals";
  if (value === "final" || value === "finals") return "finals";
  return "unassigned";
}

function quizCountsInGrades(quiz) {
  return quiz.status !== "draft" || Number(quiz.submittedCount || 0) > 0 || (quiz.rows || []).some((row) => Number(row.attempts || 0) > 0);
}

function addWorksheet(workbook, model) {
  const sheet = workbook.addWorksheet(model.name.slice(0, 31), {
    views: [{ state: "frozen", ySplit: model.freezeRows, xSplit: model.freezeColumns }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } }
  });
  model.rows.forEach((row) => sheet.addRow(row));
  model.merges.forEach((item) => sheet.mergeCells(item.startRow, item.startColumn, item.endRow, item.endColumn));
  const width = Math.max(1, ...model.rows.map((row) => row.length));
  for (let column = 1; column <= width; column += 1) {
    const values = model.rows.slice(0, 80).map((row) => String(row[column - 1] ?? ""));
    sheet.getColumn(column).width = column === 2 ? 30 : Math.max(11, Math.min(24, Math.max(...values.map((value) => value.length + 2))));
  }
  model.headerRows.forEach((rowNumber, headerIndex) => {
    const row = sheet.getRow(rowNumber);
    row.font = { bold: true, color: { argb: headerIndex < 2 ? NAVY : WHITE } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerIndex < 2 ? GOLD : NAVY } };
    row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    row.height = rowNumber === 1 ? 28 : 32;
  });
  if (model.rows.length) {
    for (let row = 1; row <= model.rows.length; row += 1) {
      for (let column = 1; column <= width; column += 1) {
        const cell = sheet.getCell(row, column);
        cell.border = { top: { style: "thin", color: { argb: BORDER } }, bottom: { style: "thin", color: { argb: BORDER } }, left: { style: "thin", color: { argb: BORDER } }, right: { style: "thin", color: { argb: BORDER } } };
        cell.alignment = { ...cell.alignment, vertical: "middle", wrapText: true };
      }
    }
  }
  model.percentColumns.forEach((column) => {
    for (let row = model.freezeRows + 1; row <= model.rows.length; row += 1) sheet.getCell(row, column).numFmt = "0.00";
  });
  model.gradeColumns.forEach((column) => {
    for (let row = model.freezeRows + 1; row <= model.rows.length; row += 1) {
      const cell = sheet.getCell(row, column);
      cell.font = { bold: true };
      if (typeof cell.value === "number" && cell.value < 75) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFECACA" } };
      else if (typeof cell.value === "number" && cell.value >= 90) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE_GOLD } };
    }
  });
  if (model.name === "INPUT") {
    for (let row = 10; row <= 14; row += 1) sheet.getCell(row, 2).numFmt = "0%";
    sheet.getColumn(1).width = 36;
    sheet.getColumn(2).width = 62;
  }
  sheet.autoFilter = model.rows.length >= model.freezeRows && model.freezeRows >= 4
    ? { from: { row: model.freezeRows, column: 1 }, to: { row: model.rows.length, column: width } }
    : undefined;
  sheet.headerFooter.oddFooter = `&LJCoins Arena&C${model.name}&RPage &P of &N`;
}

function gradeValue(value) {
  if (value == null) return "";
  if (typeof value === "number") return value;
  return value.currentGrade == null ? "" : Number(value.currentGrade);
}

function grade12Status(summary) {
  const first = summary.grade12Grades?.first;
  const second = summary.grade12Grades?.second;
  if (!first && !second) return "No period exams assigned";
  if (!first) return "Grade 1 not ready";
  if (!second) return "Grade 2 not ready";
  return `${first.riskStatus || ""} / ${second.riskStatus || ""}`;
}

function percentValue(value) {
  return value == null || value === "" ? "" : Number(value);
}

function normalizeCell(value) {
  if (value == null || Number.isNaN(value)) return "";
  return value;
}

function merge(startRow, startColumn, endRow, endColumn) {
  return { startRow, startColumn, endRow, endColumn };
}

function byDate(a, b) {
  return String(a.date || a.createdAt || "").localeCompare(String(b.date || b.createdAt || ""));
}

function safeFilePart(value) {
  return String(value || "grades").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "grades";
}

function downloadBlob(filename, content) {
  const blob = new Blob([content], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
