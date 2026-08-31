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

export function StudentMissingWork({ data, onOpen }) {
  const items = studentMissingWorkItems(data);
  const bySubject = items.reduce((groups, item) => {
    const subject = item.subject || "Other Requirements";
    groups[subject] ||= [];
    groups[subject].push(item);
    return groups;
  }, {});
  return <div className="dashboard-grid student-missing-work">
    <section className="panel wide student-missing-summary">
      <div>
        <div className="section-title">My Missing Work</div>
        <p className="muted-line">Only requirements connected to your account are shown here.</p>
      </div>
      <strong>{items.length}</strong>
    </section>
    {!items.length && <section className="panel wide student-missing-clear">
      <div className="section-title">Nothing missing</div>
      <p className="muted-line">You have no activities, quizzes, or released grade requirements that need attention.</p>
    </section>}
    {Object.entries(bySubject).map(([subject, rows]) => <section className="panel wide missing-work-group" key={subject}>
      <div className="section-head">
        <div className="section-title">{subject}</div>
        <span className="filter-count">{rows.length} missing</span>
      </div>
      {rows.map((item) => <button type="button" key={`${item.type}-${item.title}`} className="missing-work-item" onClick={() => onOpen?.(item.tab)}>
        <span><strong>{item.title}</strong><small>{item.detail}</small></span>
        <b>{item.type} · Open</b>
      </button>)}
    </section>)}
  </div>;
}

export function studentMissingWorkItems(data) {
  const studentId = data.student?.id;
  const items = [];
  (data.activities || []).forEach((activity) => {
    const row = (activity.rows || []).find((item) => item.studentId === studentId);
    if (row && !row.submitted) {
      const deadline = row.effectiveDeadline || activity.deadline;
      items.push({
        type: "Activity",
        title: activity.title,
        subject: activity.subjectName,
        detail: deadline ? `Due ${formatMissingDate(deadline)}` : "Not submitted",
        tab: "Activities"
      });
    }
  });
  (data.quizzes || []).forEach((quiz) => {
    if (quiz.status === "draft") return;
    const latest = quiz.submission?.latest;
    const total = Number(latest?.total || quiz.questions?.length || quiz.totalItems || 0);
    const passing = Number(quiz.passingScore || total || 0);
    const passed = latest && Number(latest.correct || 0) >= passing;
    if (!latest || !passed) {
      items.push({
        type: "Quiz",
        title: quiz.title,
        subject: quiz.subjectName,
        detail: latest ? `Latest ${latest.correct}/${latest.total}; passing ${passing}/${total || "?"}` : "Not answered yet",
        tab: "Quizzes"
      });
    }
  });
  (data.gradeSummaries || []).forEach((summary) => {
    (summary.missingItems || []).forEach((title) => {
      items.push({
        type: "Requirement",
        title,
        subject: summary.subjectName,
        detail: summary.section ? `Needed for ${summary.section}` : "Needed for grades",
        tab: "Profile"
      });
    });
  });
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.subject}|${item.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => String(a.subject).localeCompare(String(b.subject), undefined, { numeric: true }) || String(a.title).localeCompare(String(b.title), undefined, { numeric: true })).slice(0, 100);
}

function formatMissingDate(value) {
  const text = String(value || "");
  const date = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ? `${text}:00+08:00` : text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleString();
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
