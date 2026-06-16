import React, { useMemo, useState } from "react";
import { post, today } from "../api.js";
import { ActionModal, Field, Panel, Select, Table } from "../components/ui.jsx";
import { exportSpreadsheet, safeFilePart } from "../utils/exportSpreadsheet.js";

export default function Recitation({ data, run }) {
  const [form, setForm] = useState({ studentIds: [], subjectId: data.subjects[0]?.id || "", date: today(), amount: 1, remarks: "" });
  const [filter, setFilter] = useState({ subjectId: "all", studentId: "all", week: "all", search: "" });
  const amounts = Array.from({ length: data.settings.recitation.maxPoints }, (_, i) => ({ value: i + 1, label: i + 1 }));
  const weekOptions = buildRecitationWeeks(data.recitations);
  const eligibleStudents = useMemo(() => data.students.filter((student) => !form.subjectId || (student.subjectIds || []).includes(form.subjectId)), [data.students, form.subjectId]);
  const filteredRecitations = data.recitations.filter((recitation) => {
    const subjectMatch = filter.subjectId === "all" || recitation.subjectId === filter.subjectId;
    const studentMatch = filter.studentId === "all" || recitation.studentId === filter.studentId;
    const weekMatch = filter.week === "all" || weekKey(recitation.date) === filter.week;
    const q = filter.search.trim().toLowerCase();
    const searchMatch = !q || [recitation.date, recitation.studentName, recitation.subjectName, recitation.amount, recitation.remarks].some((value) => String(value || "").toLowerCase().includes(q));
    return subjectMatch && studentMatch && weekMatch && searchMatch;
  }).sort((a, b) => String(a.studentName).localeCompare(String(b.studentName)) || String(a.date).localeCompare(String(b.date)));

  return <div className="dashboard-grid">
    <ActionModal title="Add Recitation">
      <form onSubmit={(e) => { e.preventDefault(); run(() => post("/admin/recitations", form), form.studentIds.length > 1 ? `${form.studentIds.length} recitations added` : "Recitation added"); }}>
        <Select label="Subject" value={form.subjectId} onChange={(subjectId) => setForm({ ...form, subjectId, studentIds: form.studentIds.filter((id) => data.students.find((student) => student.id === id)?.subjectIds?.includes(subjectId)) })} options={data.subjects} />
        <SearchableStudentPicker students={eligibleStudents} selected={form.studentIds} onChange={(studentIds) => setForm({ ...form, studentIds })} />
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
        <Select label="Week" value={filter.week} onChange={(week) => setFilter({ ...filter, week })} options={[{ value: "all", label: "All weeks" }, ...weekOptions]} />
        <Field label="Search Recitations" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
        <div className="filter-count">{filteredRecitations.length} recitation{filteredRecitations.length === 1 ? "" : "s"}</div>
        <button type="button" onClick={() => exportRecitations(filteredRecitations, filter)}>Export Spreadsheet</button>
      </div>
      <Table columns={["Date", "Student", "Subject", "Amount", "Remarks"]} rows={filteredRecitations.map((r) => [r.date, r.studentName, r.subjectName, r.amount, r.remarks])} />
    </Panel>
  </div>;
}

function SearchableStudentPicker({ students, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ids = selected || [];
  const q = search.trim().toLowerCase();
  const visibleStudents = students.filter((student) => !q || [student.name, student.username, student.section].some((value) => String(value || "").toLowerCase().includes(q)));
  const selectedNames = students.filter((student) => ids.includes(student.id)).map((student) => student.name);
  const summary = selectedNames.length ? selectedNames.length <= 2 ? selectedNames.join(", ") : `${selectedNames.length} students selected` : "No students selected";
  const toggle = (id) => onChange(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  const visibleIds = visibleStudents.map((student) => student.id);
  const selectVisible = () => onChange([...new Set([...ids, ...visibleIds])]);
  const unselectVisible = () => onChange(ids.filter((id) => !visibleIds.includes(id)));

  return <div className="dropdown-checklist">
    <label>Students</label>
    <button type="button" className="soft dropdown-checklist-trigger" onClick={() => setOpen(true)}>
      <span>{summary}</span>
    </button>
    {open && <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card checklist-modal">
        <div className="section-head">
          <div className="section-title">Select Students</div>
          <button type="button" className="soft" onClick={() => setOpen(false)}>Close</button>
        </div>
        <Field label="Search Name" value={search} onChange={setSearch} />
        <div className="button-row">
          <button type="button" className="soft" onClick={selectVisible}>Check Visible</button>
          <button type="button" className="soft" onClick={unselectVisible}>Uncheck Visible</button>
          <button type="button" className="soft" onClick={() => onChange([])}>Clear All</button>
        </div>
        <div className="dropdown-checklist-menu searchable-student-list">
          {visibleStudents.length ? visibleStudents.map((student) => <label key={student.id} className="check">
            <input type="checkbox" checked={ids.includes(student.id)} onChange={() => toggle(student.id)} />
            <span>{student.name}{student.section ? ` - ${student.section}` : ""}</span>
          </label>) : <p className="muted-line">No students found.</p>}
        </div>
      </section>
    </div>}
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
