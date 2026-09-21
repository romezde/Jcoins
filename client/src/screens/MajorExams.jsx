import React, { useEffect, useMemo, useState } from "react";
import { FileDown, FileUp, Pencil } from "lucide-react";
import { del, post, put, today } from "../api.js";
import SubjectSectionPicker, { buildSubjectSectionClasses } from "../components/SubjectSectionPicker.jsx";
import { ActionModal, Field, Panel, Select, Table } from "../components/ui.jsx";
import { exportSpreadsheet, safeFilePart } from "../utils/exportSpreadsheet.js";
import { downloadXlsxTemplate, readImportFile } from "../utils/spreadsheet.js";

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
      <Table columns={["Exam", "Subject", "Section", "Date", "Max Score", "Minimum %", "Recorded", "Remarks", "Action"]} rows={exams.map((exam) => [
        exam.title,
        exam.subjectName,
        activeClass.sectionLabel,
        exam.date,
        exam.maxScore,
        `${exam.minimumPercent ?? 0}%`,
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
      <Field label="Minimum Percentage (Score of 0)" type="number" min="0" max="100" step="0.01" value={form.minimumPercent} onChange={(minimumPercent) => setForm({ ...form, minimumPercent })} />
      <p className="muted-line">A score of 0 becomes {form.minimumPercent || 0}%. Scores between 0 and {form.maxScore || 0} are scaled up to 100%.</p>
      <Field label="Remarks" value={form.remarks} onChange={(remarks) => setForm({ ...form, remarks })} />
      <button>{exam ? "Save Exam" : "Add Exam"}</button>
    </form>
  </ActionModal>;
}

function MajorExamCard({ exam, run }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const rows = (exam.rows || []).filter((row) => !q || [row.studentName, row.score, row.percent].some((value) => String(value || "").toLowerCase().includes(q)));
  return <Panel title={`${exam.title} Scores`} wide defaultOpen={false} actions={<div className="inline"><strong>{exam.tracker} recorded</strong><MajorExamScoreImport exam={exam} run={run} /><button type="button" className="soft" onClick={() => exportExam(exam)}>Export Scores</button></div>}>
    <p className="muted-line">{exam.subjectName} | {exam.section} | {exam.date} | maximum score {exam.maxScore} | minimum {exam.minimumPercent ?? 0}%</p>
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

function MajorExamScoreImport({ exam, run }) {
  const [scores, setScores] = useState([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  async function downloadTemplate() {
    const classRows = [...(exam.rows || [])].sort((a, b) => String(a.studentName).localeCompare(String(b.studentName)));
    await downloadXlsxTemplate({
      filename: `major-exam-score-template-${safeFilePart(exam.title)}-${safeFilePart(exam.subjectName)}.xlsx`,
      sheetName: "Major Exam Scores",
      columns: ["Student ID (Do Not Edit)", "Student Name", "Section", "Score"],
      sampleRows: classRows.map((row) => [row.studentId, row.studentName, exam.section, row.score ?? ""]),
      notes: [
        `${exam.title} | ${exam.subjectName} | ${exam.section}`,
        `Enter each student's score in the Score column. Valid scores are from 0 to ${exam.maxScore}.`,
        "Existing scores are included. Leave a score blank to keep that student's current score unchanged.",
        "Do not edit the Student ID column. It safely matches each score to the correct student.",
        "When the completed file is uploaded, review the preview before importing the scores."
      ]
    });
  }

  async function readScoreFile(file) {
    setError("");
    setScores([]);
    setFileName(file?.name || "");
    if (!file) return;
    try {
      const rows = await readImportFile(file, majorExamScoreHeaderMap());
      setScores(validateMajorExamScores(rows, exam));
    } catch (err) {
      setError(err.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!scores.length) {
      setError("Upload a completed score template first.");
      return;
    }
    const saved = await run(
      () => put(`/admin/major-exams/${exam.id}/scores/bulk`, { scores: scores.map(({ studentId, score }) => ({ studentId, score })) }),
      `${scores.length} exam score${scores.length === 1 ? "" : "s"} imported`
    );
    if (saved) {
      setScores([]);
      setFileName("");
    }
  }

  return <ActionModal title={`Import Scores: ${exam.title}`} buttonLabel="Import Scores" icon={FileUp}>
    <form onSubmit={submit}>
      <p className="muted-line">Download this exam's template, enter the scores, then upload the completed Excel file. Blank scores will not erase existing results.</p>
      <button type="button" className="soft" onClick={downloadTemplate}><FileDown size={16} />Download Score Template</button>
      <label>Upload Completed Template<input type="file" accept=".xlsx,.csv,text/csv" onChange={(event) => readScoreFile(event.target.files?.[0])} /></label>
      {fileName && !!scores.length && <div className="notice">{fileName}: {scores.length} score{scores.length === 1 ? "" : "s"} ready.</div>}
      {error && <div className="error">{error}</div>}
      {!!scores.length && <>
        <Table columns={["Student", "Score", "Maximum"]} rows={scores.map((row) => [row.studentName, row.score, exam.maxScore])} pageSize={10} />
        <p className="muted-line">Only the {scores.length} filled score{scores.length === 1 ? "" : "s"} shown above will be updated.</p>
      </>}
      <button disabled={!scores.length}>Import {scores.length || ""} Score{scores.length === 1 ? "" : "s"}</button>
    </form>
  </ActionModal>;
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
    minimumPercent: exam.minimumPercent ?? 0,
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
    minimumPercent: 50,
    remarks: ""
  };
}

function deleteExam(exam, run) {
  return confirm(`Delete ${exam.title}? This removes all recorded scores for this exam.`)
    && run(() => del(`/admin/major-exams/${exam.id}`), "Major exam deleted");
}

function majorExamScoreHeaderMap() {
  return {
    studentiddonotedit: "studentId",
    studentid: "studentId",
    id: "studentId",
    studentname: "studentName",
    name: "studentName",
    section: "section",
    score: "score"
  };
}

function validateMajorExamScores(rows, exam) {
  const classRows = exam.rows || [];
  const studentsById = new Map(classRows.map((row) => [String(row.studentId), row]));
  const studentsByName = new Map();
  classRows.forEach((row) => {
    const key = normalizedStudentName(row.studentName);
    studentsByName.set(key, [...(studentsByName.get(key) || []), row]);
  });
  const seen = new Set();
  const scores = [];

  rows.forEach((row, index) => {
    const scoreText = String(row.score ?? "").trim();
    if (!scoreText) return;
    const spreadsheetRow = index + 2;
    const studentId = String(row.studentId || "").trim();
    let student = studentId ? studentsById.get(studentId) : null;
    if (!student && studentId) throw new Error(`Row ${spreadsheetRow}: Student ID does not belong to this exam class.`);
    if (!student) {
      const matches = studentsByName.get(normalizedStudentName(row.studentName)) || [];
      if (matches.length !== 1) throw new Error(`Row ${spreadsheetRow}: Keep the Student ID from the downloaded template.`);
      [student] = matches;
    }
    if (seen.has(student.studentId)) throw new Error(`Row ${spreadsheetRow}: ${student.studentName} appears more than once.`);
    const score = Number(scoreText.replace(/,/g, ""));
    if (!Number.isFinite(score) || score < 0 || score > Number(exam.maxScore)) {
      throw new Error(`Row ${spreadsheetRow}: Score for ${student.studentName} must be from 0 to ${exam.maxScore}.`);
    }
    seen.add(student.studentId);
    scores.push({ studentId: student.studentId, studentName: student.studentName, score });
  });

  if (!scores.length) throw new Error("No scores were entered. Fill at least one Score cell and upload the file again.");
  return scores.sort((a, b) => String(a.studentName).localeCompare(String(b.studentName)));
}

function normalizedStudentName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function exportExam(exam) {
  exportSpreadsheet(`major-exam-${safeFilePart(exam.title)}-${safeFilePart(exam.subjectName)}.xls`, [
    "Student",
    "Exam",
    "Subject",
    "Section",
    "Date",
    "Max Score",
    "Minimum Percentage",
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
    `${exam.minimumPercent ?? 0}%`,
    row.score ?? "",
    row.percent === "" ? "" : `${row.percent}%`,
    exam.remarks || ""
  ]), exam.title);
}
