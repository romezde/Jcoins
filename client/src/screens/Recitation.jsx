import React, { useState } from "react";
import { post, today } from "../api.js";
import { ActionModal, Field, Panel, Select, Table } from "../components/ui.jsx";

export default function Recitation({ data, run }) {
  const [form, setForm] = useState({ studentId: data.students[0]?.id || "", subjectId: data.subjects[0]?.id || "", date: today(), amount: 1, remarks: "" });
  const [filter, setFilter] = useState({ subjectId: "all", studentId: "all", search: "" });
  const amounts = Array.from({ length: data.settings.recitation.maxPoints }, (_, i) => ({ value: i + 1, label: i + 1 }));
  const filteredRecitations = data.recitations.filter((recitation) => {
    const subjectMatch = filter.subjectId === "all" || recitation.subjectId === filter.subjectId;
    const studentMatch = filter.studentId === "all" || recitation.studentId === filter.studentId;
    const q = filter.search.trim().toLowerCase();
    const searchMatch = !q || [recitation.date, recitation.studentName, recitation.subjectName, recitation.amount, recitation.remarks].some((value) => String(value || "").toLowerCase().includes(q));
    return subjectMatch && studentMatch && searchMatch;
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
        <Field label="Search Recitations" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
        <div className="filter-count">{filteredRecitations.length} recitation{filteredRecitations.length === 1 ? "" : "s"}</div>
      </div>
      <Table columns={["Date", "Student", "Subject", "Amount", "Remarks"]} rows={filteredRecitations.map((r) => [r.date, r.studentName, r.subjectName, r.amount, r.remarks])} />
    </Panel>
  </div>;
}
