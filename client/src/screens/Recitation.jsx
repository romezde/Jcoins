import React, { useState } from "react";
import { post, today } from "../api.js";
import { ActionModal, Field, Panel, Select, Table } from "../components/ui.jsx";
import { exportSpreadsheet, safeFilePart } from "../utils/exportSpreadsheet.js";

export default function Recitation({ data, run }) {
  const [form, setForm] = useState({ studentId: data.students[0]?.id || "", subjectId: data.subjects[0]?.id || "", date: today(), amount: 1, remarks: "" });
  const [filter, setFilter] = useState({ subjectId: "all", studentId: "all", week: "all", search: "" });
  const amounts = Array.from({ length: data.settings.recitation.maxPoints }, (_, i) => ({ value: i + 1, label: i + 1 }));
  const weekOptions = buildRecitationWeeks(data.recitations);
  const filteredRecitations = data.recitations.filter((recitation) => {
    const subjectMatch = filter.subjectId === "all" || recitation.subjectId === filter.subjectId;
    const studentMatch = filter.studentId === "all" || recitation.studentId === filter.studentId;
    const weekMatch = filter.week === "all" || weekKey(recitation.date) === filter.week;
    const q = filter.search.trim().toLowerCase();
    const searchMatch = !q || [recitation.date, recitation.studentName, recitation.subjectName, recitation.amount, recitation.remarks].some((value) => String(value || "").toLowerCase().includes(q));
    return subjectMatch && studentMatch && weekMatch && searchMatch;
  });

  return <div className="dashboard-grid">
    <ActionModal title="Add Recitation">
      <form onSubmit={(e) => { e.preventDefault(); run(() => post("/admin/recitations", form), "Recitation added"); }}>
        <Select label="Student" value={form.studentId} onChange={(v) => setForm({ ...form, studentId: v })} options={data.students} />
        <Select label="Subject" value={form.subjectId} onChange={(v) => setForm({ ...form, subjectId: v })} options={data.subjects} />
        <Field label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        <Select label="Amount" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} options={amounts} />
        <Field label="Remarks" value={form.remarks} onChange={(v) => setForm({ ...form, remarks: v })} />
        <button>Add Recitation</button>
      </form>
    </ActionModal>
    <Panel title="Recitation History" wide defaultOpen>
      <div className="filter-bar transaction-filter-bar">
        <Select label="Subject" value={filter.subjectId} onChange={(subjectId) => setFilter({ ...filter, subjectId })} options={[{ value: "all", label: "All subjects" }, ...data.subjects.map((subject) => ({ value: subject.id, label: subject.name }))]} />
        <Select label="Student" value={filter.studentId} onChange={(studentId) => setFilter({ ...filter, studentId })} options={[{ value: "all", label: "All students" }, ...data.students.map((student) => ({ value: student.id, label: student.name }))]} />
        <Select label="Week" value={filter.week} onChange={(week) => setFilter({ ...filter, week })} options={[{ value: "all", label: "All weeks" }, ...weekOptions]} />
        <Field label="Search Recitations" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
        <div className="filter-count">{filteredRecitations.length} recitation{filteredRecitations.length === 1 ? "" : "s"}</div>
        <button type="button" onClick={() => exportRecitations(filteredRecitations, filter)}>Export Spreadsheet</button>
      </div>
      <Table columns={["Date", "Student", "Subject", "Amount", "Remarks"]} rows={filteredRecitations.map((r) => [r.date, r.studentName, r.subjectName, r.amount, r.remarks])} />
    </Panel>
  </div>;
}

function exportRecitations(recitations, filter) {
  const weekLabel = filter.week === "all" ? "all-weeks" : filter.week;
  exportSpreadsheet(`recitations-${safeFilePart(weekLabel)}.xls`, ["Week", "Date", "Student", "Subject", "Amount", "Remarks"], recitations.map((recitation) => [
    weekDisplay(recitation.date),
    recitation.date,
    recitation.studentName,
    recitation.subjectName,
    recitation.amount,
    recitation.remarks
  ]), "Recitations");
}

function buildRecitationWeeks(recitations) {
  const weeks = new Map();
  recitations.forEach((recitation) => {
    const key = weekKey(recitation.date);
    if (key && !weeks.has(key)) weeks.set(key, { value: key, label: weekDisplay(recitation.date) });
  });
  return [...weeks.values()].sort((a, b) => b.value.localeCompare(a.value));
}

function weekKey(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}

function weekDisplay(value) {
  const start = weekKey(value);
  if (!start) return "";
  const end = new Date(`${start}T00:00:00`);
  end.setDate(end.getDate() + 6);
  return `${start} to ${end.toISOString().slice(0, 10)}`;
}
