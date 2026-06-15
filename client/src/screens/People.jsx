import React, { useState } from "react";
import { del, post, put, request } from "../api.js";
import { fileToProfilePhoto, ProfilePhotoFrame } from "../components/ProfilePhoto.jsx";
import { ActionModal, DropdownChecklist, Field, Panel, Select, Table } from "../components/ui.jsx";
import { downloadXlsxTemplate, readImportFile } from "../utils/spreadsheet.js";

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
  const [profileModal, setProfileModal] = useState(null);
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
      const rows = (await readImportFile(file, studentHeaderMap())).map(cleanStudentImportRow).filter((row) => row.name || row.username);
      if (!rows.length) throw new Error("No student rows found in the file.");
      setImportRows(rows);
    } catch (err) {
      setImportError(err.message);
    }
  }
  async function downloadTemplate() {
    const sampleSubjects = subjectTemplateCells(visibleSubjects);
    const sampleSection = sections[0] || "";
    await downloadXlsxTemplate({
      filename: "jcoins-student-import-template.xlsx",
      sheetName: "Students",
      columns: ["name", "username", "tempPassword", "section", "subject1", "subject2", "subject3", "subject4", "subject5", "startingJCoins"],
      sampleRows: [
        ["Juan Dela Cruz", "juan.delacruz", "temp123", sampleSection, ...sampleSubjects, "0"],
        ["Maria Santos", "maria.santos", "temp123", sampleSection, ...sampleSubjects, "0"]
      ],
      dropdowns: {
        section: sections,
        subject1: visibleSubjects.map((subject) => subject.name),
        subject2: visibleSubjects.map((subject) => subject.name),
        subject3: visibleSubjects.map((subject) => subject.name),
        subject4: visibleSubjects.map((subject) => subject.name),
        subject5: visibleSubjects.map((subject) => subject.name)
      },
      notes: [
        "Use the dropdowns for section and subject columns to avoid spelling mistakes.",
        "If a student has more than one subject, put one subject per subject column. Leave unused subject columns blank.",
        "You may still upload a CSV file, but the Excel template is safer because it has dropdowns."
      ]
    });
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
  async function openStudentProfile(student) {
    setProfileModal({ loading: true, student });
    try {
      setProfileModal(await request(`/admin/students/${student.id}/profile-photo`));
    } catch (err) {
      setProfileModal({ error: err.message, student });
    }
  }

  return <div className="dashboard-grid">
    {resetModal && <ResetSuccessModal reset={resetModal} onClose={() => setResetModal(null)} />}
    {confirmReset && <ResetConfirmModal target={confirmReset} onCancel={() => setConfirmReset(null)} onConfirm={() => run(() => resetPassword(confirmReset), "Password reset")} />}
    {profileModal && <StudentProfileModal profile={profileModal} onClose={() => setProfileModal(null)} />}
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
          <p className="muted-line">Download the Excel template, use the dropdowns, then upload the completed .xlsx file. CSV still works too.</p>
          <div className="button-row">
            <button type="button" className="soft" onClick={downloadTemplate}>Download Template</button>
          </div>
          <label>Upload Filled Template<input type="file" accept=".xlsx,.csv,text/csv" onChange={(e) => readStudentImportFile(e.target.files?.[0])} /></label>
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
          <div className="student-name-cell">
            <button type="button" className="ghost table-name-button" onClick={() => openStudentProfile(s)}>{s.name}</button>
            <input value={edit.name} onChange={(e) => setEdits({ ...edits, [s.id]: { ...edit, name: e.target.value } })} />
          </div>,
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

function StudentProfileModal({ profile, onClose }) {
  const student = profile.student || {};
  const needed = Math.max(0, Number(student.nextTarget || 0) - Number(student.currentJCoins || 0));
  return <div className="modal-backdrop" role="dialog" aria-modal="true">
    <section className="modal-card modal-card-wide student-profile-modal">
      <div className="section-head">
        <div className="section-title">Student Profile</div>
        <button type="button" className="soft" onClick={onClose}>Close</button>
      </div>
      {profile.loading ? <p className="muted-line">Loading profile...</p> : profile.error ? <p className="error">{profile.error}</p> : <>
        <div className="student-profile-hero">
          <ProfilePhotoFrame student={student} className="profile-picture-large" />
          <div>
            <h2>{student.name}</h2>
            <p>{student.section || "No section"} • {student.username || "No username"}</p>
            <div className="big-coins">{Number(student.currentJCoins || 0).toLocaleString()} JCoins</div>
            <div className="rank-pill rank-chip">{student.rank || "Unranked"}</div>
          </div>
        </div>
        <div className="bar"><div className="fill" style={{ width: `${student.progress || 0}%` }} /></div>
        <p className="needed-coins">{needed ? `${needed.toLocaleString()} JCoins needed to reach ${student.nextRank}` : "Max rank reached"}</p>
        <div className="account-grid">
          <AccountMini label="Subjects" value={(student.subjectNames || []).join(", ") || "None"} />
          <AccountMini label="Recent Activities" value={profile.activities?.length || 0} />
          <AccountMini label="Recent Transactions" value={profile.transactions?.length || 0} />
          <AccountMini label="Photo" value={student.profilePhoto ? "Uploaded" : "None"} />
        </div>
        <Table columns={["Date", "Type", "Amount", "Remarks"]} rows={(profile.transactions || []).map((transaction) => [new Date(transaction.createdAt).toLocaleString(), transaction.type, transaction.amount, transaction.note])} pageSize={5} />
        <Table columns={["Week", "Subject", "Attendance Bonus", "Recitation Bonus"]} rows={(profile.weeks || []).map((week) => [week.title, week.subjectName, week.attendanceBonus ? "Earned" : "Not yet", week.recitationBonus ? "Earned" : "Not yet"])} pageSize={5} />
        <Table columns={["Activity", "Subject", "Deadline", "Submitted", "Earned"]} rows={(profile.activities || []).map((activity) => [activity.activity, activity.subjectName, activity.deadline, activity.submitted ? "Submitted" : "Pending", activity.earned])} pageSize={5} />
      </>}
    </section>
  </div>;
}

function AccountMini({ label, value }) {
  return <div className="account-item"><span>{label}</span><strong>{value}</strong></div>;
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
  const subjectColumns = [row.subjects, row.subject, row.subject1, row.subject2, row.subject3, row.subject4, row.subject5]
    .filter(Boolean)
    .join("; ");
  return {
    name: String(row.name || row.student || row.studentName || "").trim(),
    username: String(row.username || row.user || "").trim(),
    tempPassword: String(row.tempPassword || row.password || "temp123").trim(),
    section: String(row.section || "").trim(),
    subjects: subjectColumns,
    startingJCoins: Number(row.startingJCoins || row.jcoins || row.currentJCoins || 0)
  };
}

function subjectTemplateCells(subjects) {
  return Array.from({ length: 5 }, (_, index) => subjects[index]?.name || "");
}

function studentHeaderMap() {
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
    subject1: "subject1",
    subject2: "subject2",
    subject3: "subject3",
    subject4: "subject4",
    subject5: "subject5",
    startingjcoins: "startingJCoins",
    startjcoins: "startingJCoins",
    currentjcoins: "currentJCoins",
    jcoins: "jcoins"
  };
}
