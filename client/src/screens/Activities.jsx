import React, { useState } from "react";
import { post, put, today } from "../api.js";
import { ActionModal, Field, Panel, Select, Table } from "../components/ui.jsx";

export default function Activities({ data, run }) {
  const [form, setForm] = useState({ title: "Activity 1", subjectId: data.subjects[0]?.id || "", dateCreated: today(), deadline: today(), type: data.settings.activities.types[0]?.name || "Simple", remarks: "" });
  const [filter, setFilter] = useState({ subjectId: "all", search: "" });
  const filteredActivities = data.activities.filter((activity) => {
    const subjectMatch = filter.subjectId === "all" || activity.subjectId === filter.subjectId;
    const q = filter.search.trim().toLowerCase();
    const searchMatch = !q || [activity.title, activity.subjectName, activity.dateCreated, activity.deadline, activity.type, activity.remarks].some((value) => String(value || "").toLowerCase().includes(q));
    return subjectMatch && searchMatch;
  });

  return <div className="dashboard-grid">
    <ActionModal title="Create Activity">
      <form onSubmit={(e) => { e.preventDefault(); run(() => post("/admin/activities", form), "Activity created"); }}>
        <Field label="Activity Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
        <Select label="Subject" value={form.subjectId} onChange={(v) => setForm({ ...form, subjectId: v })} options={data.subjects} />
        <Field label="Date Created" type="date" value={form.dateCreated} onChange={(v) => setForm({ ...form, dateCreated: v })} />
        <Field label="Deadline" type="date" value={form.deadline} onChange={(v) => setForm({ ...form, deadline: v })} />
        <Select label="Type" value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={data.settings.activities.types.map((t) => t.name)} />
        <Field label="Remarks" value={form.remarks} onChange={(v) => setForm({ ...form, remarks: v })} />
        <button>Create Activity</button>
      </form>
    </ActionModal>
    <Panel title="Activity List" wide defaultOpen>
      <div className="filter-bar">
        <Select label="Subject" value={filter.subjectId} onChange={(subjectId) => setFilter({ ...filter, subjectId })} options={[{ value: "all", label: "All subjects" }, ...data.subjects.map((subject) => ({ value: subject.id, label: subject.name }))]} />
        <Field label="Search Activities" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
        <div className="filter-count">{filteredActivities.length} activit{filteredActivities.length === 1 ? "y" : "ies"}</div>
      </div>
      <Table columns={["Activity", "Subject", "Created", "Tracker", "Deadline", "Type", "Remarks"]} rows={filteredActivities.map((a) => [a.title, a.subjectName, a.dateCreated, a.tracker, a.deadline, a.type, a.remarks])} />
    </Panel>
    {filteredActivities.map((a) => <ActivityCard key={a.id} activity={a} run={run} />)}
  </div>;
}

function ActivityCard({ activity, run }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const rows = activity.rows.filter((row) => !q || [row.studentName, row.dateSubmitted, row.daysLate, row.earned, row.remarks, row.submitted ? "submitted" : "pending"].some((value) => String(value || "").toLowerCase().includes(q)));
  return <Panel title={`${activity.title} Details`} wide defaultOpen={false} actions={<strong>{activity.tracker} submitted</strong>}>
    <p className="muted-line">{activity.subjectName} | {activity.type} | deadline {activity.deadline} | base {activity.basePoints} JC</p>
    <div className="filter-bar">
      <Field label="Search Students" value={search} onChange={setSearch} />
      <div className="filter-count">{rows.length} student{rows.length === 1 ? "" : "s"}</div>
    </div>
    <Table columns={["Student", "Submitted?", "Date Submitted", "Days Late", "Earned", "Remarks"]} rows={rows.map((r) => [
      r.studentName,
      <input type="checkbox" checked={r.submitted} onChange={(e) => run(() => put(`/admin/activities/${activity.id}/submissions`, { ...r, submitted: e.target.checked, dateSubmitted: e.target.checked ? r.dateSubmitted || today() : "" }), "Submission saved")} />,
      <input type="date" value={r.dateSubmitted || ""} onChange={(e) => run(() => put(`/admin/activities/${activity.id}/submissions`, { ...r, submitted: true, dateSubmitted: e.target.value }), "Submission saved")} />,
      r.daysLate,
      r.earned,
      <input defaultValue={r.remarks} onBlur={(e) => run(() => put(`/admin/activities/${activity.id}/submissions`, { ...r, remarks: e.target.value }), "Remarks saved")} />
    ])} />
  </Panel>;
}
