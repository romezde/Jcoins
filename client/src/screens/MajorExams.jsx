import React, { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { del, post, put, today } from "../api.js";
import SubjectSectionPicker, { buildSubjectSectionClasses } from "../components/SubjectSectionPicker.jsx";
import { ActionModal, Field, Panel, Select, Table } from "../components/ui.jsx";
import { exportSpreadsheet, safeFilePart } from "../utils/exportSpreadsheet.js";

export default function MajorExams({ data, run }) {
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [search, setSearch] = useState("");
  const classes = useMemo(() => buildSubjectSectionClasses(data, (subjectId, section) => (data.majorExams || []).filter((exam) => exam.subjectId === subjectId && exam.section === section).length), [data.subjects, data.students, data.majorExams]);
  const activeClass = classes.find((item) => item.key === selectedClassKey) || null;
  const exams = (data.majorExams || []).filter((exam) => {
    if (!activeClass || exam.subjectId !== activeClass.subjectId || exam.section !== activeClass.section) return false;
    const q = search.trim().toLowerCase();
    return !q || [exam.title, exam.subjectName, exam.date, exam.remarks].some((value) => String(value || "").toLowerCase().includes(q));
  });

  return <div className="dashboard-grid">
    <MajorExamForm data={data} run={run} />
    <SubjectSectionPicker classes={classes} selectedKey={selectedClassKey} onSelect={setSelectedClassKey} title="Major Exam Classes" itemLabel="exams" />
    {activeClass && <Panel title={`${activeClass.subjectName} · ${activeClass.sectionLabel}`} wide defaultOpen actions={<MajorExamForm data={data} run={run} presetClass={activeClass} buttonLabel="Add Exam for This Class" />}>
      <div className="filter-bar">
        <Field label="Search Exams" value={search} onChange={setSearch} />
        <div className="filter-count">{exams.length} exam{exams.length === 1 ? "" : "s"}</div>
      </div>
      <Table columns={["Exam", "Subject", "Section", "Date", "Max Score", "Recorded", "Remarks", "Action"]} rows={exams.map((exam) => [
        exam.title,
        exam.subjectName,
        activeClass.sectionLabel,
        exam.date,
        exam.maxScore,
        exam.tracker,
        exam.remarks,
        <div className="inline"><MajorExamForm data={data} run={run} exam={exam} /><button type="button" className="soft" onClick={() => exportExam(exam)}>Export</button><button type="button" className="danger" onClick={() => deleteExam(exam, run)}>Delete</button></div>
      ])} />
    </Panel>}
    {activeClass && exams.map((exam) => <MajorExamCard key={exam.id} exam={exam} run={run} />)}
    {!activeClass && <section className="panel wide attendance-empty">Choose a subject and section above to view major exams.</section>}
    {activeClass && !exams.length && <section className="panel wide attendance-empty">No major exams found for this class.</section>}
  </div>;
}

function MajorExamForm({ data, run, exam = null, presetClass = null, buttonLabel = null }) {
  const [form, setForm] = useState(() => exam ? examFormValues(exam) : newExamForm(data, presetClass));
  const hasScores = !!exam?.rows?.some((row) => row.recorded);
  useEffect(() => {
    if (exam) setForm(examFormValues(exam));
    else setForm(newExamForm(data, presetClass));
  }, [exam?.id, exam?.updatedAt, presetClass?.key]);
  function submit(event) {
    event.preventDefault();
    run(() => exam ? put(`/admin/major-exams/${exam.id}`, form) : post("/admin/major-exams", form), exam ? "Major exam updated" : "Major exam added");
  }
  return <ActionModal title={exam ? `Edit ${exam.title}` : "Add Major Exam"} buttonLabel={buttonLabel || (exam ? "Edit" : "Add Major Exam")} icon={exam ? Pencil : undefined}>
    <form onSubmit={submit}>
      <Field label="Exam Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
      <Select label="Subject" value={form.subjectId} onChange={(subjectId) => setForm({ ...form, subjectId })} options={hasScores ? data.subjects.filter((subject) => subject.id === form.subjectId) : data.subjects} />
      <Select label="Section" value={form.section} onChange={(section) => setForm({ ...form, section })} options={hasScores ? [{ value: form.section, label: form.section }] : (data.sections || []).map((section) => ({ value: section, label: section }))} />
      {hasScores && <p className="muted-line">Subject and section are locked after scores are recorded.</p>}
      <Field label="Date" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} />
      <Field label="Maximum Score" type="number" min="1" max="1000" step="0.01" value={form.maxScore} onChange={(maxScore) => setForm({ ...form, maxScore })} />
      <Field label="Remarks" value={form.remarks} onChange={(remarks) => setForm({ ...form, remarks })} />
      <button>{exam ? "Save Exam" : "Add Exam"}</button>
    </form>
  </ActionModal>;
}

function MajorExamCard({ exam, run }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const rows = (exam.rows || []).filter((row) => !q || [row.studentName, row.score, row.percent].some((value) => String(value || "").toLowerCase().includes(q)));
  return <Panel title={`${exam.title} Scores`} wide defaultOpen={false} actions={<div className="inline"><strong>{exam.tracker} recorded</strong><button type="button" className="soft" onClick={() => exportExam(exam)}>Export Scores</button></div>}>
    <p className="muted-line">{exam.subjectName} | {exam.section} | {exam.date} | maximum score {exam.maxScore}</p>
    <div className="filter-bar">
      <Field label="Search Students" value={search} onChange={setSearch} />
      <div className="filter-count">{rows.length} student{rows.length === 1 ? "" : "s"}</div>
    </div>
    <Table columns={["Student", "Score", "Percent"]} rows={rows.map((row) => [
      row.studentName,
      <MajorExamScoreInput exam={exam} row={row} run={run} />,
      row.percent === "" ? "-" : `${row.percent}%`
    ])} pageSize={30} />
  </Panel>;
}

function MajorExamScoreInput({ exam, row, run }) {
  const [score, setScore] = useState(row.score ?? "");
  useEffect(() => setScore(row.score ?? ""), [row.score, exam.id]);
  const changed = String(score ?? "") !== String(row.score ?? "");
  return <div className="major-exam-score-cell">
    <input className="score-input" type="number" min="0" max={exam.maxScore} step="0.01" value={score} onChange={(event) => setScore(event.target.value)} />
    <button type="button" className="soft" disabled={!changed} onClick={() => run(() => put(`/admin/major-exams/${exam.id}/scores`, { studentId: row.studentId, score }), "Exam score saved")}>Save</button>
  </div>;
}

function examFormValues(exam) {
  return {
    title: exam.title,
    subjectId: exam.subjectId,
    section: exam.section || "",
    date: exam.date || today(),
    maxScore: exam.maxScore ?? 100,
    remarks: exam.remarks || ""
  };
}

function newExamForm(data, presetClass = null) {
  return {
    title: "Major Exam",
    subjectId: presetClass?.subjectId || data.subjects?.[0]?.id || "",
    section: presetClass?.section || data.sections?.[0] || "",
    date: today(),
    maxScore: 100,
    remarks: ""
  };
}

function deleteExam(exam, run) {
  return confirm(`Delete ${exam.title}? This removes all recorded scores for this exam.`)
    && run(() => del(`/admin/major-exams/${exam.id}`), "Major exam deleted");
}

function exportExam(exam) {
  exportSpreadsheet(`major-exam-${safeFilePart(exam.title)}-${safeFilePart(exam.subjectName)}.xls`, [
    "Student",
    "Exam",
    "Subject",
    "Section",
    "Date",
    "Max Score",
    "Score",
    "Percent",
    "Remarks"
  ], [...(exam.rows || [])].sort((a, b) => String(a.studentName).localeCompare(String(b.studentName))).map((row) => [
    row.studentName,
    exam.title,
    exam.subjectName,
    exam.section,
    exam.date,
    exam.maxScore,
    row.score ?? "",
    row.percent === "" ? "" : `${row.percent}%`,
    exam.remarks || ""
  ]), exam.title);
}
