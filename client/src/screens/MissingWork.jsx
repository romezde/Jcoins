import React, { useMemo, useState } from "react";
import SubjectSectionPicker, { buildSubjectSectionClasses } from "../components/SubjectSectionPicker.jsx";
import { Field, Panel, Table } from "../components/ui.jsx";
import { exportSpreadsheet, safeFilePart } from "../utils/exportSpreadsheet.js";

export default function MissingWork({ data }) {
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [search, setSearch] = useState("");
  const summaries = data.gradeSummaries || [];
  const classes = useMemo(() => buildSubjectSectionClasses(data, (subjectId, section) => summaries.filter((row) => (
    row.subjectId === subjectId
      && String(row.section || "").trim() === String(section || "").trim()
      && (row.missingItems || []).length > 0
  )).length), [data.subjects, data.students, summaries]);
  const activeClass = classes.find((item) => item.key === selectedClassKey) || null;
  const classRows = activeClass ? summaries.filter((row) => (
    row.subjectId === activeClass.subjectId
      && String(row.section || "").trim() === activeClass.section
      && (row.missingItems || []).length > 0
  )) : [];
  const query = search.trim().toLowerCase();
  const rows = classRows.filter((row) => !query || [
    row.studentName,
    row.subjectName,
    row.section,
    row.riskStatus,
    ...(row.missingItems || [])
  ].some((value) => String(value || "").toLowerCase().includes(query)));
  const requirementCount = rows.reduce((total, row) => total + (row.missingItems || []).length, 0);

  return <div className="dashboard-grid">
    <SubjectSectionPicker
      classes={classes}
      selectedKey={selectedClassKey}
      onSelect={setSelectedClassKey}
      title="Missing Work by Class"
      itemLabel="students missing work"
    />
    {activeClass && <Panel title={`${activeClass.subjectName} - ${activeClass.sectionLabel}`} wide defaultOpen>
      <div className="filter-bar">
        <Field label="Search Student or Requirement" value={search} onChange={setSearch} />
        <div className="filter-count">{rows.length} student{rows.length === 1 ? "" : "s"} · {requirementCount} missing</div>
      </div>
      <Table columns={["Student", "Subject", "Section", "Missing Count", "Missing Requirements", "Current Grade", "Risk"]} rows={rows.map((row) => [
        row.studentName,
        row.subjectName,
        row.section,
        (row.missingItems || []).length,
        (row.missingItems || []).join(", "),
        formatGrade(row.currentGrade),
        row.riskStatus || "-"
      ])} pageSize={10} />
      <button type="button" className="soft" disabled={!rows.length} onClick={() => exportMissingWork(activeClass, rows)}>Export Missing Work</button>
    </Panel>}
    {!activeClass && <section className="panel wide attendance-empty">Choose a subject and section above to see which students have missing work.</section>}
    {activeClass && !classRows.length && <section className="panel wide attendance-empty">No students have missing work in this subject and section.</section>}
  </div>;
}

function formatGrade(value) {
  const grade = Number(value);
  return Number.isFinite(grade) ? Math.round(grade * 100) / 100 : "-";
}

function exportMissingWork(activeClass, rows) {
  exportSpreadsheet(`missing-work-${safeFilePart(activeClass.subjectName)}-${safeFilePart(activeClass.section)}.xls`, [
    "Student",
    "Subject",
    "Section",
    "Missing Count",
    "Missing Requirements",
    "Current Grade",
    "Risk"
  ], [...rows].sort((a, b) => String(a.studentName).localeCompare(String(b.studentName), undefined, { numeric: true })).map((row) => [
    row.studentName,
    row.subjectName,
    row.section,
    (row.missingItems || []).length,
    (row.missingItems || []).join(", "),
    formatGrade(row.currentGrade),
    row.riskStatus || "-"
  ]), "Missing Work");
}
