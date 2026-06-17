import React, { useEffect, useMemo, useState } from "react";
import { post, today } from "../api.js";
import { StudentFilterFields, StudentMultiPicker, studentMatchesFilters } from "../components/StudentMultiPicker.jsx";
import { ActionModal, Field, Panel, Select, Table } from "../components/ui.jsx";
import { exportSpreadsheet, safeFilePart } from "../utils/exportSpreadsheet.js";

export default function Recitation({ data, run }) {
  const [form, setForm] = useState({ studentIds: [], subjectId: data.subjects[0]?.id || "", date: today(), amount: 1, remarks: "" });
  const [filter, setFilter] = useState({ subjectId: "all", studentId: "all", section: "all", guildId: "all", week: "all", search: "" });
  const amounts = Array.from({ length: data.settings.recitation.maxPoints }, (_, i) => ({ value: i + 1, label: i + 1 }));
  const weekOptions = buildRecitationWeeks(data.recitations);
  const studentById = new Map(data.students.map((student) => [student.id, student]));
  const eligibleStudents = useMemo(() => data.students.filter((student) => !form.subjectId || (student.subjectIds || []).includes(form.subjectId)), [data.students, form.subjectId]);
  useEffect(() => {
    const prefill = (event) => {
      const detail = event.detail || {};
      const query = String(detail.studentQuery || "").trim().toLowerCase();
      const matches = query ? data.students.filter((student) => student.name.toLowerCase().includes(query)) : [];
      const selectedSubjectId = matches[0]?.subjectIds?.includes(form.subjectId)
        ? form.subjectId
        : matches[0]?.subjectIds?.[0] || form.subjectId || data.subjects[0]?.id || "";
      const amount = Math.max(1, Math.min(Number(detail.amount || form.amount || 1), Number(data.settings.recitation.maxPoints || 1)));
      setForm((current) => ({
        ...current,
        subjectId: selectedSubjectId,
        studentIds: matches.map((student) => student.id),
        amount,
        remarks: detail.remarks || current.remarks
      }));
    };
    window.addEventListener("jcoins:prefill-recitation", prefill);
    return () => window.removeEventListener("jcoins:prefill-recitation", prefill);
  }, [data.students, data.subjects, data.settings.recitation.maxPoints, form.amount, form.subjectId]);
  const filteredRecitations = data.recitations.filter((recitation) => {
    const subjectMatch = filter.subjectId === "all" || recitation.subjectId === filter.subjectId;
    const studentMatch = filter.studentId === "all" || recitation.studentId === filter.studentId;
    const targetMatch = studentMatchesFilters(data, studentById.get(recitation.studentId), filter, { includeSubject: false, includeSearch: false });
    const weekMatch = filter.week === "all" || weekKey(recitation.date) === filter.week;
    const q = filter.search.trim().toLowerCase();
    const searchMatch = !q || [recitation.date, recitation.studentName, recitation.subjectName, recitation.amount, recitation.remarks].some((value) => String(value || "").toLowerCase().includes(q));
    return subjectMatch && studentMatch && targetMatch && weekMatch && searchMatch;
  }).sort((a, b) => String(a.studentName).localeCompare(String(b.studentName)) || String(a.date).localeCompare(String(b.date)));

  return <div className="dashboard-grid">
    <ActionModal title="Add Recitation" openEvent="jcoins:open-recitation-modal">
      <form onSubmit={(e) => { e.preventDefault(); run(() => post("/admin/recitations", form), form.studentIds.length > 1 ? `${form.studentIds.length} recitations added` : "Recitation added"); }}>
        <Select label="Subject" value={form.subjectId} onChange={(subjectId) => setForm({ ...form, subjectId, studentIds: form.studentIds.filter((id) => data.students.find((student) => student.id === id)?.subjectIds?.includes(subjectId)) })} options={data.subjects} />
        <StudentMultiPicker data={data} students={eligibleStudents} selected={form.studentIds} onChange={(studentIds) => setForm({ ...form, studentIds })} showSubjectFilter={false} />
        <Field label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        <Select label="Amount" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} options={amounts} />
        <Field label="Remarks" value={form.remarks} onChange={(v) => setForm({ ...form, remarks: v })} />
        <button disabled={!form.studentIds.length}>Add Recitation</button>
      </form>
    </ActionModal>
    <Panel title="Recitation History" wide defaultOpen>
      <div className="filter-bar transaction-filter-bar">
        <Select label="Subject" value={filter.subjectId} onChange={(subjectId) => setFilter({ ...filter, subjectId })} options={[{ value: "all", label: "All subjects" }, ...data.subjects.map((subject) => ({ value: subject.id, label: subject.name }))]} />
        <Select label="Student" value={filter.studentId} onChange={(studentId) => setFilter({ ...filter, studentId })} options={[{ value: "all", label: "All students" }, ...data.students.map((student) => ({ value: student.id, label: student.name }))]} />
        <StudentFilterFields data={data} filter={filter} setFilter={setFilter} showSubject={false} showSearch={false} />
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
  const summary = new Map();
  recitations.forEach((recitation) => {
    const key = recitation.studentId;
    if (!summary.has(key)) summary.set(key, { studentName: recitation.studentName, subjects: new Set(), dates: new Set(), count: 0, earned: 0 });
    const row = summary.get(key);
    row.subjects.add(recitation.subjectName);
    row.dates.add(recitation.date);
    row.count += 1;
    row.earned += Number(recitation.amount || 0);
  });
  const rows = [...summary.values()]
    .sort((a, b) => String(a.studentName).localeCompare(String(b.studentName)))
    .map((row) => [
      row.studentName,
      [...row.subjects].sort().join(", "),
      row.count,
      [...row.dates].sort().join(", "),
      row.earned
    ]);
  exportSpreadsheet(`recitations-summary-${safeFilePart(weekLabel)}.xls`, ["Student", "Subject(s)", "Times Recited", "Dates Recited", "JCoins Earned"], rows, "Recitation Summary");
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
