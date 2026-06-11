import React, { useState } from "react";
import { del, post, put } from "../api.js";
import { fileToProfilePhoto } from "../components/ProfilePhoto.jsx";
import { ActionModal, DropdownChecklist, Field, Panel, Select, Table } from "../components/ui.jsx";

export default function People({ data, run, role }) {
  const [student, setStudent] = useState({ name: "", section: "", username: "", tempPassword: "temp123", startingJCoins: 0, subjectIds: role === "teacher" ? data.user.subjectIds || [] : [] });
  const [teacher, setTeacher] = useState({ username: "", tempPassword: "teacher123!", role: "teacher", subjectIds: [], sectionIds: [] });
  const [sectionName, setSectionName] = useState("");
  const [edits, setEdits] = useState({});
  const [resetModal, setResetModal] = useState(null);
  const [confirmReset, setConfirmReset] = useState(null);
  const [studentFilter, setStudentFilter] = useState({ section: "all", search: "" });
  const [importRows, setImportRows] = useState([]);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState("");
  const visibleSubjects = role === "teacher" ? data.subjects.filter((s) => (data.user.subjectIds || []).includes(s.id)) : data.subjects;
  const sections = data.sections?.length ? data.sections : ["A", "B"];
  const filteredStudents = data.students.filter((student) => {
    const sectionMatch = studentFilter.section === "all" ? true : studentFilter.section === "__none" ? !student.section : student.section === studentFilter.section;
    const q = studentFilter.search.trim().toLowerCase();
    const searchMatch = !q || [student.name, student.username, student.section, student.rank].some((value) => String(value || "").toLowerCase().includes(q));
    return sectionMatch && searchMatch;
  });
  async function resetPassword(target = confirmReset) {
    if (!target) return;
    const tempPassword = generateTempPassword();
    await post(`/admin/users/${target.userId}/reset-password`, { tempPassword });
    setConfirmReset(null);
    setResetModal({ username: target.username, tempPassword });
  }
  async function readStudentImportFile(file) {
    setImportError("");
    setImportResult("");
    setImportRows([]);
    if (!file) return;
    try {
      const text = await file.text();
      const rows = csvToObjects(text).map(cleanStudentImportRow).filter((row) => row.name || row.username);
      if (!rows.length) throw new Error("No student rows found in the file.");
      setImportRows(rows);
    } catch (err) {
      setImportError(err.message);
    }
  }
  function downloadTemplate() {
    const sampleSubjects = visibleSubjects.slice(0, Math.min(2, visibleSubjects.length)).map((subject) => subject.name).join("; ");
    const sampleSection = sections[0] || "";
    const rows = [
      ["name", "username", "tempPassword", "section", "subjects", "startingJCoins"],
      ["Juan Dela Cruz", "juan.delacruz", "temp123", sampleSection, sampleSubjects, "0"],
      ["Maria Santos", "maria.santos", "temp123", sampleSection, sampleSubjects, "0"]
    ];
    downloadCsv("jcoins-student-import-template.csv", rows);
  }
  async function importStudents(e) {
    e.preventDefault();
    setImportError("");
    setImportResult("");
    if (!importRows.length) {
      setImportError("Choose a filled student template first.");
      return;
    }
    let result = null;
    await run(async () => {
      result = await post("/admin/students/bulk", { students: importRows });
      setImportRows([]);
      setImportResult(`${result.createdCount} student${result.createdCount === 1 ? "" : "s"} imported.`);
    }, "Students imported");
  }
  async function uploadStudentPhoto(studentId, file) {
    if (!file) return;
    const profilePhoto = await fileToProfilePhoto(file);
    await run(() => post(`/admin/students/${studentId}/profile-photo`, { profilePhoto }), "Profile picture updated");
  }

  return <div className="dashboard-grid">
    {resetModal && <ResetSuccessModal reset={resetModal} onClose={() => setResetModal(null)} />}
    {confirmReset && <ResetConfirmModal target={confirmReset} onCancel={() => setConfirmReset(null)} onConfirm={() => run(() => resetPassword(confirmReset), "Password reset")} />}
    <div className="quick-actions wide">
      <ActionModal title="Add Section">
        <form onSubmit={(e) => { e.preventDefault(); run(() => post("/admin/sections", { name: sectionName }), "Section added"); setSectionName(""); }}>
          <Field label="Section Name" value={sectionName} onChange={setSectionName} />
          <button>Add Section</button>
        </form>
      </ActionModal>

      <ActionModal title="Add Student">
        <form onSubmit={(e) => { e.preventDefault(); run(() => post("/admin/students", student), "Student created"); }}>
          <Field label="Name" value={student.name} onChange={(v) => setStudent({ ...student, name: v })} />
          <Select label="Section" value={student.section} onChange={(v) => setStudent({ ...student, section: v })} options={[{ value: "", label: "Select section" }, ...sections.map((section) => ({ value: section, label: section }))]} />
          <Field label="Username" value={student.username} onChange={(v) => setStudent({ ...student, username: v })} />
          <Field label="Temp Password" type="password" value={student.tempPassword} onChange={(v) => setStudent({ ...student, tempPassword: v })} />
          <Field label="Starting JCoins" type="number" value={student.startingJCoins} onChange={(v) => setStudent({ ...student, startingJCoins: v })} />
          <DropdownChecklist label="Subjects" items={visibleSubjects} selected={student.subjectIds} onChange={(ids) => setStudent({ ...student, subjectIds: ids })} />
          <button>Create Student</button>
        </form>
      </ActionModal>

      <ActionModal title="Import Students">
        <form onSubmit={importStudents}>
          <p className="muted-line">Download the template, fill it in Excel or Google Sheets, save as CSV, then upload it here.</p>
          <div className="button-row">
            <button type="button" className="soft" onClick={downloadTemplate}>Download Template</button>
          </div>
          <label>Upload Filled CSV<input type="file" accept=".csv,text/csv" onChange={(e) => readStudentImportFile(e.target.files?.[0])} /></label>
          {importError && <div className="error">{importError}</div>}
          {importResult && <div className="notice">{importResult}</div>}
          {!!importRows.length && <Table columns={["Name", "Username", "Section", "Subjects", "Starting JC"]} rows={importRows.slice(0, 20).map((row) => [row.name, row.username, row.section || "No section", row.subjects, row.startingJCoins])} pageSize={5} />}
          {!!importRows.length && <p className="muted-line">Ready to import {importRows.length} student{importRows.length === 1 ? "" : "s"}. Preview shows the first 20 rows.</p>}
          <button disabled={!importRows.length}>Import Students</button>
        </form>
      </ActionModal>

      {role === "admin" && <ActionModal title="Add Teacher">
        <form onSubmit={(e) => { e.preventDefault(); run(() => post("/admin/users", teacher), "Teacher created"); }}>
          <Field label="Username" value={teacher.username} onChange={(v) => setTeacher({ ...teacher, username: v })} />
          <Field label="Temp Password" type="password" value={teacher.tempPassword} onChange={(v) => setTeacher({ ...teacher, tempPassword: v })} />
          <DropdownChecklist label="Assigned Subjects" items={data.subjects} selected={teacher.subjectIds} onChange={(ids) => setTeacher({ ...teacher, subjectIds: ids })} />
          <DropdownChecklist label="Assigned Sections" items={sections.map((section) => ({ id: section, name: section }))} selected={teacher.sectionIds} onChange={(ids) => setTeacher({ ...teacher, sectionIds: ids })} />
          <button>Create Teacher</button>
        </form>
      </ActionModal>}
    </div>

    <Panel title="Section List" defaultOpen={false}>
      <Table columns={["Section", "Action"]} rows={sections.map((section) => [
        section,
        <button className="danger" onClick={() => confirm(`Delete section ${section}? Students in this section will be changed to no section.`) && run(() => del(`/admin/sections/${encodeURIComponent(section)}`), "Section deleted")}>Delete</button>
      ])} />
    </Panel>

    <Panel title="Students Table" wide defaultOpen={false}>
      <div className="filter-bar">
        <Select label="Section" value={studentFilter.section} onChange={(section) => setStudentFilter({ ...studentFilter, section })} options={[{ value: "all", label: "All sections" }, ...sections.map((section) => ({ value: section, label: section })), { value: "__none", label: "No section" }]} />
        <Field label="Search Student" value={studentFilter.search} onChange={(search) => setStudentFilter({ ...studentFilter, search })} />
        <div className="filter-count">{filteredStudents.length} student{filteredStudents.length === 1 ? "" : "s"}</div>
      </div>
      <Table columns={["Name", "Username", "Section", "Subjects", "JCoins", "Rank", "Actions"]} rows={filteredStudents.map((s) => {
        const edit = edits[s.id] || s;
        return [
          <input value={edit.name} onChange={(e) => setEdits({ ...edits, [s.id]: { ...edit, name: e.target.value } })} />,
          s.username || "No account",
          <select value={edit.section || ""} onChange={(e) => setEdits({ ...edits, [s.id]: { ...edit, section: e.target.value } })}><option value="">No section</option>{sections.map((section) => <option key={section} value={section}>{section}</option>)}</select>,
          <DropdownChecklist label="Subjects" compact items={visibleSubjects} selected={edit.subjectIds || []} onChange={(ids) => setEdits({ ...edits, [s.id]: { ...edit, subjectIds: ids } })} />,
          s.currentJCoins,
          s.rank,
          <div className="inline">
            <button onClick={() => run(() => put(`/admin/students/${s.id}`, edit))}>Save</button>
            <label className="soft file-button table-file-button">Photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => uploadStudentPhoto(s.id, e.target.files?.[0])} /></label>
            <button disabled={!s.userId} onClick={() => setConfirmReset({ userId: s.userId, username: s.username || s.name })}>Reset Pass</button>
            <button className="danger" onClick={() => confirm(`Remove ${s.name}?`) && run(() => del(`/admin/students/${s.id}`), "Student removed")}>Remove</button>
          </div>
        ];
      })} />
    </Panel>

    {role === "admin" && <Users data={data} run={run} onReset={(userId, username) => setConfirmReset({ userId, username })} />}
  </div>;
}

function Users({ data, run, onReset }) {
  const accounts = data.users.filter((user) => user.role !== "student");
  return <Panel title="Teachers and Accounts" wide defaultOpen={false}>
    <Table columns={["Username", "Role", "Subjects", "Sections", "Must Change", "Actions"]} rows={accounts.map((u) => [
      u.username,
      <select value={u.role} onChange={(e) => run(() => put(`/admin/users/${u.id}`, { role: e.target.value, subjectIds: u.subjectIds, sectionIds: u.sectionIds || [] }))}>{["admin", "teacher", "student", "display"].map((r) => <option key={r}>{r}</option>)}</select>,
      <DropdownChecklist label="Subjects" compact items={data.subjects} selected={u.subjectIds || []} onChange={(ids) => run(() => put(`/admin/users/${u.id}`, { subjectIds: ids, sectionIds: u.sectionIds || [], role: u.role }))} />,
      <DropdownChecklist label="Sections" compact items={(data.sections || []).map((section) => ({ id: section, name: section }))} selected={u.sectionIds || []} onChange={(ids) => run(() => put(`/admin/users/${u.id}`, { subjectIds: u.subjectIds || [], sectionIds: ids, role: u.role }))} />,
      u.mustChangePassword ? "Yes" : "No",
      <div className="inline"><button onClick={() => run(() => onReset(u.id, u.username), "Password reset")}>Reset Pass</button><button className="danger" onClick={() => confirm(`Remove ${u.username}?`) && run(() => del(`/admin/users/${u.id}`), "Account removed")}>Remove</button></div>
    ])} />
  </Panel>;
}

function ResetSuccessModal({ reset, onClose }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true">
    <section className="modal-card">
      <div className="section-title">Password Reset Success</div>
      <p className="muted-line">Give this temporary password to the user. They will be asked to change it after login.</p>
      <div className="reset-result">
        <span>Username</span>
        <strong>{reset.username}</strong>
        <span>Temporary Password</span>
        <code>{reset.tempPassword}</code>
      </div>
      <div className="button-row"><button onClick={onClose}>Done</button></div>
    </section>
  </div>;
}

function ResetConfirmModal({ target, onCancel, onConfirm }) {
  const [value, setValue] = useState("");
  const canReset = value === "RESET";
  return <div className="modal-backdrop" role="dialog" aria-modal="true">
    <section className="modal-card">
      <div className="section-title">Confirm Password Reset</div>
      <p className="muted-line">This will immediately replace the password for <strong>{target.username}</strong>.</p>
      <Field label='Type "RESET" to confirm' value={value} onChange={setValue} />
      <div className="button-row">
        <button className="soft" onClick={onCancel}>Cancel</button>
        <button className="danger" disabled={!canReset} onClick={onConfirm}>Reset Password</button>
      </div>
    </section>
  </div>;
}

function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (length) => Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `JC-${part(4)}-${part(3)}`;
}

function cleanStudentImportRow(row) {
  return {
    name: String(row.name || row.student || row.studentName || "").trim(),
    username: String(row.username || row.user || "").trim(),
    tempPassword: String(row.tempPassword || row.password || "temp123").trim(),
    section: String(row.section || "").trim(),
    subjects: String(row.subjects || row.subject || "").trim(),
    startingJCoins: Number(row.startingJCoins || row.jcoins || row.currentJCoins || 0)
  };
}

function csvToObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => String(value).trim())) rows.push(row);
  return rows;
}

function normalizeHeader(header) {
  const key = String(header || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return {
    studentname: "name",
    name: "name",
    username: "username",
    user: "username",
    temppassword: "tempPassword",
    temporarypassword: "tempPassword",
    password: "tempPassword",
    section: "section",
    subject: "subjects",
    subjects: "subjects",
    startingjcoins: "startingJCoins",
    startjcoins: "startingJCoins",
    currentjcoins: "currentJCoins",
    jcoins: "jcoins"
  }[key] || key;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
