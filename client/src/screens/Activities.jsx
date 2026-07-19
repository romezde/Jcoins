import React, { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { del, post, postFormWithProgress, put, today } from "../api.js";
import ActivityFileViewer from "../components/ActivityFileViewer.jsx";
import SubjectSectionPicker, { buildSubjectSectionClasses } from "../components/SubjectSectionPicker.jsx";
import { ActionModal, Field, Panel, Select, Table } from "../components/ui.jsx";
import { exportSpreadsheet, safeFilePart } from "../utils/exportSpreadsheet.js";

export default function Activities({ data, run }) {
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [filter, setFilter] = useState({ search: "" });
  const classes = useMemo(() => buildSubjectSectionClasses(data, (subjectId, section) => data.activities.filter((activity) => activity.subjectId === subjectId && (!activity.section || activity.section === section)).length), [data.subjects, data.students, data.activities]);
  const activeClass = classes.find((item) => item.key === selectedClassKey) || null;
  const filteredActivities = data.activities.filter((activity) => {
    const subjectMatch = activeClass && activity.subjectId === activeClass.subjectId && (!activity.section || activity.section === activeClass.section);
    const q = filter.search.trim().toLowerCase();
    const searchMatch = !q || [activity.title, activity.subjectName, activity.dateCreated, activity.deadline, activity.type, activity.remarks].some((value) => String(value || "").toLowerCase().includes(q));
    return subjectMatch && searchMatch;
  });

  return <div className="dashboard-grid">
    <ActivityFormModal data={data} run={run} />
    <SubjectSectionPicker classes={classes} selectedKey={selectedClassKey} onSelect={setSelectedClassKey} title="Activity Classes" itemLabel="activities" />
    {activeClass && <Panel title={`${activeClass.subjectName} · ${activeClass.sectionLabel}`} wide defaultOpen actions={<ActivityFormModal key={activeClass.key} data={data} run={run} presetClass={activeClass} buttonLabel="Create Activity for This Class" />}>
      <div className="filter-bar">
        <Field label="Search Activities" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
        <div className="filter-count">{filteredActivities.length} activit{filteredActivities.length === 1 ? "y" : "ies"}</div>
      </div>
      <Table columns={["Activity", "Subject", "Section", "Created", "Tracker", "Deadline", "Type", "Score", "Remarks", "Action"]} rows={filteredActivities.map((a) => {
        const classRows = activityRowsForSection(a, data, activeClass.section);
        return [a.title, a.subjectName, activeClass.sectionLabel, a.dateCreated, `${classRows.filter((row) => row.submitted).length}/${classRows.length}`, formatActivityDateTime(a.deadline), a.type, "0-100", a.remarks, <div className="inline"><ActivityFormModal data={data} run={run} activity={a} /><button type="button" className="soft" onClick={() => exportActivity(a, classRows)}>Export Spreadsheet</button><button className="danger" onClick={() => deleteActivity(a, run)}>Delete</button></div>];
      })} />
    </Panel>}
    {activeClass && filteredActivities.map((a) => <ActivityCard key={a.id} activity={a} section={activeClass.section} sectionLabel={activeClass.sectionLabel} data={data} run={run} />)}
    {!activeClass && <section className="panel wide attendance-empty">Choose a subject and section above to view its activities.</section>}
  </div>;
}

function ActivityFormModal({ data, run, activity = null, presetClass = null, buttonLabel = null }) {
  const [form, setForm] = useState(() => activity ? activityFormValues(activity) : newActivityForm(data, presetClass));
  const hasSubmissions = !!activity?.rows?.some((row) => row.submitted || row.extendedDeadline || row.remarks || row.score !== "");
  useEffect(() => {
    if (activity) setForm(activityFormValues(activity));
    else setForm(newActivityForm(data, presetClass));
  }, [activity?.title, activity?.subjectId, activity?.section, activity?.dateCreated, activity?.deadline, activity?.type, activity?.remarks, presetClass?.key]);
  function submit(event) {
    event.preventDefault();
    run(() => activity ? put(`/admin/activities/${activity.id}`, form) : post("/admin/activities", form), activity ? "Activity updated" : "Activity created");
  }
  return <ActionModal title={activity ? `Edit ${activity.title}` : "Create Activity"} buttonLabel={buttonLabel || (activity ? "Edit" : "Create Activity")} icon={activity ? Pencil : undefined}>
    <form onSubmit={submit}>
      <Field label="Activity Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
      <Select label="Subject" value={form.subjectId} onChange={(subjectId) => setForm({ ...form, subjectId })} options={hasSubmissions ? data.subjects.filter((subject) => subject.id === form.subjectId) : data.subjects} />
      <Select label="Section" value={form.section} onChange={(section) => setForm({ ...form, section })} options={hasSubmissions
        ? [{ value: form.section, label: form.section || "All sections" }]
        : [{ value: "", label: "All sections" }, ...(data.sections || []).map((section) => ({ value: section, label: section }))]} />
      {hasSubmissions && <p className="muted-line">The subject and section are locked after submissions. Deadline or type changes will safely recalculate late limits and JCoins.</p>}
      <Field label="Date Created" type="date" value={form.dateCreated} onChange={(dateCreated) => setForm({ ...form, dateCreated })} />
      <Field label="Deadline" type="datetime-local" value={form.deadline} onChange={(deadline) => setForm({ ...form, deadline })} />
      <Select label="Type" value={form.type} onChange={(type) => setForm({ ...form, type })} options={data.settings.activities.types.map((item) => item.name)} />
      <label>Score Scale<input value="100%" readOnly /></label>
      <Field label="Remarks" value={form.remarks} onChange={(remarks) => setForm({ ...form, remarks })} />
      <button>{activity ? "Save Changes" : "Create Activity"}</button>
    </form>
  </ActionModal>;
}

function ActivityCard({ activity, section, sectionLabel, data, run }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const classRows = activityRowsForSection(activity, data, section);
  const rows = classRows.filter((row) => !q || [row.studentName, row.dateSubmitted, row.daysLate, row.earned, row.score, row.remarks, row.fileNames, row.fileName, row.status].some((value) => String(value || "").toLowerCase().includes(q)));
  const tracker = `${classRows.filter((row) => row.submitted).length}/${classRows.length}`;
  return <Panel title={`${activity.title} Details`} wide defaultOpen={false} actions={<div className="inline"><strong>{tracker} submitted</strong><ActivityFormModal data={data} run={run} activity={activity} /><button type="button" className="soft" onClick={() => exportActivity(activity, classRows)}>Export Activity</button><button className="danger" onClick={() => deleteActivity(activity, run)}>Delete Activity</button></div>}>
    <p className="muted-line">{activity.subjectName} | {sectionLabel} | {activity.type} | deadline {formatActivityDateTime(activity.deadline)} | base {activity.basePoints} JC | actual score 0-100</p>
    <ActivityMaterialsControl activity={activity} run={run} />
    <div className="filter-bar">
      <Field label="Search Students" value={search} onChange={setSearch} />
      <div className="filter-count">{rows.length} student{rows.length === 1 ? "" : "s"}</div>
    </div>
    <Table columns={["Student", "Status", "Submitted At", "Individual Deadline", "Late", "Max Score", "Actual Score", "File", "Earned", "Remarks"]} rows={rows.map((r) => [
      r.studentName,
      <ActivitySubmissionControl activity={activity} row={r} run={run} />,
      r.submittedAt ? formatActivityDateTime(r.submittedAt) : "-",
      <ActivityExtensionControl activity={activity} row={r} run={run} />,
      r.daysLate,
      r.maxScoreAllowed,
      <input className="score-input" type="number" min="0" max={r.maxScoreAllowed} defaultValue={r.score ?? ""} onBlur={(e) => run(() => put(`/admin/activities/${activity.id}/submissions`, { studentId: r.studentId, submitted: r.submitted, submittedAt: r.submittedAt, score: e.target.value, remarks: r.remarks }), "Score saved")} />,
      <ActivitySubmissionFileCell activity={activity} row={r} run={run} />,
      r.earned,
      <input defaultValue={r.remarks} onBlur={(e) => run(() => put(`/admin/activities/${activity.id}/submissions`, { studentId: r.studentId, submitted: r.submitted, submittedAt: r.submittedAt, score: r.score, remarks: e.target.value }), "Remarks saved")} />
    ])} />
  </Panel>;
}

function ActivitySubmissionFileCell({ activity, row, run }) {
  const [progress, setProgress] = useState(null);
  const files = row.files?.length ? row.files : row.fileName ? [{ fileIndex: 0, fileName: row.fileName }] : [];
  async function uploadForStudent(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    try {
      await run(() => {
        validateActivitySubmissionFiles(incoming);
        const formData = new FormData();
        incoming.forEach((file) => formData.append("files", file, file.name));
        formData.append("remarks", row.remarks || "");
        setProgress(0);
        return postFormWithProgress(`/admin/activities/${activity.id}/submissions/${row.studentId}/files`, formData, (value) => setProgress(value));
      }, "Student activity file uploaded");
    } finally {
      setProgress(null);
    }
  }
  return <div className="activity-upload-box">
    <ActivityFileViewer activityId={activity.id} studentId={row.studentId} files={files} />
    <label className="soft file-button table-file-button">{files.length ? "Replace File" : "Upload File"}<input type="file" accept={activityFileAccept} multiple disabled={progress != null} onChange={(event) => { uploadForStudent(event.target.files); event.target.value = ""; }} /></label>
    {progress != null && <div className="activity-upload-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
      <span style={{ width: `${progress}%` }} />
      <strong>{progress}%</strong>
    </div>}
  </div>;
}

function ActivityMaterialsControl({ activity, run }) {
  const [progress, setProgress] = useState(null);
  async function uploadMaterials(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    try {
      await run(() => {
        validateActivityMaterialFiles(files);
        const formData = new FormData();
        files.forEach((file) => formData.append("files", file, file.name));
        setProgress(0);
        return postFormWithProgress(`/admin/activities/${activity.id}/materials`, formData, (value) => setProgress(value));
      }, "Activity materials uploaded");
    } finally {
      setProgress(null);
    }
  }
  return <section className="activity-materials-box">
    <div>
      <strong>Student Materials</strong>
      <span className="muted-line">{activity.materials?.length ? `${activity.materials.length} file${activity.materials.length === 1 ? "" : "s"} available` : "No files uploaded yet"}</span>
    </div>
    <ActivityFileViewer activityId={activity.id} files={activity.materials || []} filePath={(fileIndex) => `/activities/${activity.id}/materials/${fileIndex}`} />
    <div className="inline">
      <label className="soft file-button">Upload Materials<input type="file" accept={activityFileAccept} multiple disabled={progress != null} onChange={(event) => { uploadMaterials(event.target.files); event.target.value = ""; }} /></label>
      {!!activity.materials?.length && <button type="button" className="danger" onClick={() => confirm(`Remove all uploaded files from ${activity.title}?`) && run(() => del(`/admin/activities/${activity.id}/materials`), "Activity materials removed")}>Clear Materials</button>}
    </div>
    {progress != null && <div className="activity-upload-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
      <span style={{ width: `${progress}%` }} />
      <strong>{progress}%</strong>
    </div>}
  </section>;
}

function ActivitySubmissionControl({ activity, row, run }) {
  const uploaded = row.submissionMethod === "upload";
  const updateSubmission = (submitted) => {
    if (!submitted && !confirm(`Mark ${row.studentName}'s physical work as not submitted? Their activity JCoins will be removed.`)) return;
    run(() => put(`/admin/activities/${activity.id}/submissions`, {
      studentId: row.studentId,
      submitted,
      submittedAt: submitted ? row.submittedAt : "",
      submissionMethod: submitted ? "physical" : "",
      score: row.score,
      remarks: row.remarks
    }), submitted ? "Physical work marked submitted" : "Submission removed");
  };
  return <div className="activity-submission-control">
    <label className="check">
      <input type="checkbox" checked={row.submitted} disabled={uploaded} onChange={(event) => updateSubmission(event.target.checked)} />
      Submitted
    </label>
    <span className="muted-line">{row.status || (row.submitted ? "Submitted" : "Missing")}</span>
  </div>;
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
    section: activity.section || "",
    dateCreated: activity.dateCreated,
    deadline: toDatetimeLocal(activity.deadline),
    type: activity.type,
    maxScore: 100,
    remarks: activity.remarks || ""
  };
}

function newActivityForm(data, presetClass = null) {
  return {
    title: "Activity 1",
    subjectId: presetClass?.subjectId || data.subjects[0]?.id || "",
    section: presetClass?.section || "",
    dateCreated: today(),
    deadline: `${today()}T23:59`,
    type: data.settings.activities.types[0]?.name || "Simple",
    maxScore: 100,
    remarks: ""
  };
}

function activityRowsForSection(activity, data, section) {
  if (activity.section && activity.section !== section) return [];
  if (activity.section) return activity.rows || [];
  const studentIds = new Set((data.students || []).filter((student) => String(student.section || "") === section && (student.subjectIds || []).includes(activity.subjectId)).map((student) => student.id));
  return (activity.rows || []).filter((row) => studentIds.has(row.studentId));
}

const activityFileAccept = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.txt,.csv";

function validateActivityMaterialFiles(files) {
  const allowed = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "jpg", "jpeg", "png", "webp", "txt", "csv"];
  if (files.length > 10) throw new Error("Upload up to 10 files at a time.");
  const extensions = files.map((file) => file.name.split(".").pop()?.toLowerCase() || "");
  if (extensions.some((extension) => !allowed.includes(extension))) throw new Error("Upload PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, JPG/PNG/WEBP, TXT, or CSV only.");
  if (files.some((file) => file.size > 50 * 1024 * 1024)) throw new Error("Each file must be 50 MB or less.");
}

function validateActivitySubmissionFiles(files) {
  validateActivityMaterialFiles(files);
  const imageExtensions = ["jpg", "jpeg", "png", "webp"];
  const extensions = files.map((file) => file.name.split(".").pop()?.toLowerCase() || "");
  if (files.length > 1 && extensions.some((extension) => !imageExtensions.includes(extension))) throw new Error("Multiple uploads are only for photos. Upload documents one at a time.");
  if (files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) throw new Error("Photos are too large together. Maximum total upload is 100 MB.");
}

function exportActivity(activity, rows = activity.rows) {
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
  ], [...rows].sort((a, b) => String(a.studentName).localeCompare(String(b.studentName))).map((row) => [
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
