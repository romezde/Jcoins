import React, { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { del, post, put, today } from "../api.js";
import ActivityFileViewer from "../components/ActivityFileViewer.jsx";
import { ActionModal, Field, Panel, Select, Table } from "../components/ui.jsx";
import { exportSpreadsheet, safeFilePart } from "../utils/exportSpreadsheet.js";

export default function Activities({ data, run }) {
  const [filter, setFilter] = useState({ subjectId: "all", search: "" });
  const filteredActivities = data.activities.filter((activity) => {
    const subjectMatch = filter.subjectId === "all" || activity.subjectId === filter.subjectId;
    const q = filter.search.trim().toLowerCase();
    const searchMatch = !q || [activity.title, activity.subjectName, activity.dateCreated, activity.deadline, activity.type, activity.remarks].some((value) => String(value || "").toLowerCase().includes(q));
    return subjectMatch && searchMatch;
  });

  return <div className="dashboard-grid">
    <ActivityFormModal data={data} run={run} />
    <Panel title="Activity List" wide defaultOpen>
      <div className="filter-bar">
        <Select label="Subject" value={filter.subjectId} onChange={(subjectId) => setFilter({ ...filter, subjectId })} options={[{ value: "all", label: "All subjects" }, ...data.subjects.map((subject) => ({ value: subject.id, label: subject.name }))]} />
        <Field label="Search Activities" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
        <div className="filter-count">{filteredActivities.length} activit{filteredActivities.length === 1 ? "y" : "ies"}</div>
      </div>
      <Table columns={["Activity", "Subject", "Created", "Tracker", "Deadline", "Type", "Score", "Remarks", "Action"]} rows={filteredActivities.map((a) => [a.title, a.subjectName, a.dateCreated, a.tracker, formatActivityDateTime(a.deadline), a.type, "0-100", a.remarks, <div className="inline"><ActivityFormModal data={data} run={run} activity={a} /><button type="button" className="soft" onClick={() => exportActivity(a)}>Export Spreadsheet</button><button className="danger" onClick={() => deleteActivity(a, run)}>Delete</button></div>])} />
    </Panel>
    {filteredActivities.map((a) => <ActivityCard key={a.id} activity={a} data={data} run={run} />)}
  </div>;
}

function ActivityFormModal({ data, run, activity = null }) {
  const [form, setForm] = useState(() => activity ? activityFormValues(activity) : {
    title: "Activity 1",
    subjectId: data.subjects[0]?.id || "",
    dateCreated: today(),
    deadline: `${today()}T23:59`,
    type: data.settings.activities.types[0]?.name || "Simple",
    maxScore: 100,
    remarks: ""
  });
  const hasSubmissions = !!activity?.rows?.some((row) => row.submitted || row.extendedDeadline || row.remarks || row.score !== "");
  useEffect(() => {
    if (activity) setForm(activityFormValues(activity));
  }, [activity?.title, activity?.subjectId, activity?.dateCreated, activity?.deadline, activity?.type, activity?.remarks]);
  function submit(event) {
    event.preventDefault();
    run(() => activity ? put(`/admin/activities/${activity.id}`, form) : post("/admin/activities", form), activity ? "Activity updated" : "Activity created");
  }
  return <ActionModal title={activity ? `Edit ${activity.title}` : "Create Activity"} buttonLabel={activity ? "Edit" : "Create Activity"} icon={activity ? Pencil : undefined}>
    <form onSubmit={submit}>
      <Field label="Activity Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
      <Select label="Subject" value={form.subjectId} onChange={(subjectId) => setForm({ ...form, subjectId })} options={hasSubmissions ? data.subjects.filter((subject) => subject.id === form.subjectId) : data.subjects} />
      {hasSubmissions && <p className="muted-line">The subject is locked after submissions. Deadline or type changes will safely recalculate late limits and JCoins.</p>}
      <Field label="Date Created" type="date" value={form.dateCreated} onChange={(dateCreated) => setForm({ ...form, dateCreated })} />
      <Field label="Deadline" type="datetime-local" value={form.deadline} onChange={(deadline) => setForm({ ...form, deadline })} />
      <Select label="Type" value={form.type} onChange={(type) => setForm({ ...form, type })} options={data.settings.activities.types.map((item) => item.name)} />
      <label>Score Scale<input value="100%" readOnly /></label>
      <Field label="Remarks" value={form.remarks} onChange={(remarks) => setForm({ ...form, remarks })} />
      <button>{activity ? "Save Changes" : "Create Activity"}</button>
    </form>
  </ActionModal>;
}

function ActivityCard({ activity, data, run }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const rows = activity.rows.filter((row) => !q || [row.studentName, row.dateSubmitted, row.daysLate, row.earned, row.score, row.remarks, row.fileNames, row.fileName, row.status].some((value) => String(value || "").toLowerCase().includes(q)));
  return <Panel title={`${activity.title} Details`} wide defaultOpen={false} actions={<div className="inline"><strong>{activity.tracker} submitted</strong><ActivityFormModal data={data} run={run} activity={activity} /><button type="button" className="soft" onClick={() => exportActivity(activity)}>Export Activity</button><button className="danger" onClick={() => deleteActivity(activity, run)}>Delete Activity</button></div>}>
    <p className="muted-line">{activity.subjectName} | {activity.type} | deadline {formatActivityDateTime(activity.deadline)} | base {activity.basePoints} JC | actual score 0-100</p>
    <div className="filter-bar">
      <Field label="Search Students" value={search} onChange={setSearch} />
      <div className="filter-count">{rows.length} student{rows.length === 1 ? "" : "s"}</div>
    </div>
    <Table columns={["Student", "Status", "Submitted At", "Individual Deadline", "Late", "Max Score", "Actual Score", "File", "Earned", "Remarks"]} rows={rows.map((r) => [
      r.studentName,
      r.status || (r.submitted ? "Submitted" : "Missing"),
      r.submittedAt ? formatActivityDateTime(r.submittedAt) : "-",
      <ActivityExtensionControl activity={activity} row={r} run={run} />,
      r.daysLate,
      r.maxScoreAllowed,
      <input className="score-input" type="number" min="0" max={r.maxScoreAllowed} defaultValue={r.score ?? ""} onBlur={(e) => run(() => put(`/admin/activities/${activity.id}/submissions`, { studentId: r.studentId, submitted: r.submitted, submittedAt: r.submittedAt, score: e.target.value, remarks: r.remarks }), "Score saved")} />,
      <ActivityFileViewer activityId={activity.id} studentId={r.studentId} files={r.files?.length ? r.files : r.fileName ? [{ fileIndex: 0, fileName: r.fileName }] : []} />,
      r.earned,
      <input defaultValue={r.remarks} onBlur={(e) => run(() => put(`/admin/activities/${activity.id}/submissions`, { studentId: r.studentId, submitted: r.submitted, submittedAt: r.submittedAt, score: r.score, remarks: e.target.value }), "Remarks saved")} />
    ])} />
  </Panel>;
}

function ActivityExtensionControl({ activity, row, run }) {
  const [deadline, setDeadline] = useState(() => toOptionalDatetimeLocal(row.extendedDeadline));
  useEffect(() => setDeadline(toOptionalDatetimeLocal(row.extendedDeadline)), [row.extendedDeadline]);
  const save = (value) => run(() => put(`/admin/activities/${activity.id}/extensions`, {
    studentId: row.studentId,
    extendedDeadline: value
  }), value ? "Deadline extended" : "Extension removed");
  return <div className="activity-extension-control">
    <input type="datetime-local" min={toDatetimeLocal(activity.deadline)} value={deadline} onChange={(event) => setDeadline(event.target.value)} aria-label={`Individual deadline for ${row.studentName}`} />
    <div className="inline">
      <button type="button" className="soft" disabled={!deadline || deadline === toOptionalDatetimeLocal(row.extendedDeadline)} onClick={() => save(deadline)}>Save</button>
      {row.extendedDeadline && <button type="button" className="danger" onClick={() => {
        if (!confirm(`Remove ${row.studentName}'s individual deadline? Late limits, score, and JCoins will be recalculated using the class deadline.`)) return;
        setDeadline("");
        save("");
      }}>Clear</button>}
    </div>
  </div>;
}

function deleteActivity(activity, run) {
  return confirm(`Delete ${activity.title}? This removes submissions and JCoins earned from this activity.`)
    && run(() => del(`/admin/activities/${activity.id}`), "Activity deleted");
}

function activityFormValues(activity) {
  return {
    title: activity.title,
    subjectId: activity.subjectId,
    dateCreated: activity.dateCreated,
    deadline: toDatetimeLocal(activity.deadline),
    type: activity.type,
    maxScore: 100,
    remarks: activity.remarks || ""
  };
}

function exportActivity(activity) {
  exportSpreadsheet(`activity-${safeFilePart(activity.title)}-${safeFilePart(activity.subjectName)}.xls`, [
    "Student",
    "Activity",
    "Subject",
    "Date Created",
    "Original Deadline",
    "Student Deadline",
    "Type",
    "Base JCoins",
    "Max Score",
    "Submitted",
    "Date Submitted",
    "Days Late",
    "Max Score Allowed",
    "Score",
    "File",
    "Remarks",
    "JCoins Earned"
  ], [...activity.rows].sort((a, b) => String(a.studentName).localeCompare(String(b.studentName))).map((row) => [
    row.studentName,
    activity.title,
    activity.subjectName,
    activity.dateCreated,
    formatActivityDateTime(activity.deadline),
    formatActivityDateTime(row.effectiveDeadline || activity.deadline),
    activity.type,
    activity.basePoints,
    100,
    row.status || (row.submitted ? "Submitted" : "Pending"),
    row.submittedAt ? formatActivityDateTime(row.submittedAt) : "",
    row.daysLate,
    row.maxScoreAllowed,
    row.score ?? "",
    row.fileNames || row.fileName || "",
    row.remarks || "",
    row.earned
  ]), activity.title);
}

function toDatetimeLocal(value) {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T23:59`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return text.slice(0, 16);
  return text || `${today()}T23:59`;
}

function toOptionalDatetimeLocal(value) {
  return value ? toDatetimeLocal(value) : "";
}

function formatActivityDateTime(value) {
  const text = String(value || "");
  if (!text) return "-";
  const date = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ? `${text}:00+08:00` : text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleString();
}
