import React, { useState } from "react";
import { Sparkles } from "lucide-react";
import { post, postFormWithProgress } from "../api.js";
import ActivityFileViewer from "../components/ActivityFileViewer.jsx";
import CosmeticFx from "../components/CosmeticFx.jsx";
import { fileToProfilePhoto, ProfilePhotoFrame } from "../components/ProfilePhoto.jsx";
import { DataTable, Field, Panel, Stat, Table } from "../components/ui.jsx";

export function StudentProfile({ data, run }) {
  const needed = Math.max(0, Number(data.student.nextTarget || 0) - Number(data.student.currentJCoins || 0));
  const appearanceClasses = data.student.appearance?.classes?.join(" ") || "";
  const badge = data.student.appearance?.items?.badge?.name;
  const avatarIcon = data.student.appearance?.items?.avatarIcon?.icon;
  async function uploadPhoto(file) {
    const profilePhoto = await fileToProfilePhoto(file);
    await run(() => post("/student/profile-photo", { profilePhoto }), "Profile picture updated");
  }
  async function removePhoto() {
    await run(() => post("/student/profile-photo", { profilePhoto: "" }), "Profile picture removed");
  }
  return <div className="dashboard-grid">
    <section className={`profile-card wide appearance-card ${appearanceClasses} ${rankClass(data.student.rank)}`}>
      <CosmeticFx classes={appearanceClasses} />
      <ProfilePhotoFrame student={data.student} className="profile-picture-large" />
      <div className="cosmetic-avatar profile-avatar profile-icon-badge">{avatarIcon || <Sparkles />}</div>
      <h1 className="cosmetic-name">{data.student.name}</h1>
      {badge && <div className="cosmetic-badge">{badge}</div>}
      <div className="big-coins">{data.student.currentJCoins.toLocaleString()} JCoins</div>
      <div className="rank-pill rank-chip">Quiz Code: {data.student.quizCode || "-"}</div>
      <div className="rank-pill rank-chip">{data.student.rank}</div>
      <div className="bar"><div className="fill" style={{ width: `${data.student.progress}%` }} /></div>
      <p>{data.student.progress}% to {data.student.nextRank}</p>
      <p className="needed-coins">{needed ? `${needed.toLocaleString()} JCoins needed to reach ${data.student.nextRank}` : "Max rank reached"}</p>
      <div className="profile-photo-actions">
        <label className="soft file-button">Upload Profile Picture<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => uploadPhoto(e.target.files?.[0])} /></label>
        {data.student.profilePhoto && <button type="button" className="soft" onClick={removePhoto}>Remove Picture</button>}
      </div>
    </section>
    <DataTable title="Attendance / Recitation Weekly Bonuses" defaultOpen columns={["Week", "Subject", "Attendance Bonus", "Recitation Bonus"]} rows={data.weeks.map((w) => [w.title, w.subjectName, w.attendanceBonus ? "Earned" : "Not yet", w.recitationBonus ? "Earned" : "Not yet"])} />
    <DataTable title="Recent JCoins History" columns={["Date", "Type", "Amount", "Remarks"]} rows={data.transactions.map((t) => [new Date(t.createdAt).toLocaleString(), t.type, t.amount, t.note])} />
  </div>;
}

export function StudentActivities({ data, run }) {
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});
  const q = search.trim().toLowerCase();
  const rows = data.activities.flatMap((activity) => activity.rows.filter((row) => row.studentId === data.student.id).map((row) => ({
    id: activity.id,
    activity: activity.title,
    subject: activity.subjectName,
    materials: activity.materials || [],
    deadline: row.effectiveDeadline || activity.deadline,
    status: row.status || (row.submitted ? "Submitted" : "Missing"),
    submittedAt: row.submittedAt,
    daysLate: row.daysLate,
    maxScoreAllowed: row.maxScoreAllowed,
    score: row.score,
    earned: row.earned,
    fileName: row.fileName,
    files: row.files || [],
    studentNote: row.studentNote
  }))).filter((row) => !q || Object.values(row).some((value) => String(value || "").toLowerCase().includes(q)));
  async function uploadSubmission(activityId, fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    await run(() => {
      validateActivityFiles(files);
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file, file.name));
      formData.append("studentNote", notes[activityId] || "");
      setUploadProgress((current) => ({ ...current, [activityId]: 0 }));
      return postFormWithProgress(`/student/activities/${activityId}/submit`, formData, (progress) => {
        setUploadProgress((current) => ({ ...current, [activityId]: progress }));
      });
    }, "Activity submitted");
    setUploadProgress((current) => {
      const next = { ...current };
      delete next[activityId];
      return next;
    });
  }
  return <Panel title="My Activities" wide defaultOpen>
    <div className="filter-bar">
      <Field label="Search Activities" value={search} onChange={setSearch} />
      <div className="filter-count">{rows.length} activit{rows.length === 1 ? "y" : "ies"}</div>
    </div>
    <Table columns={["Activity", "Subject", "Materials", "Deadline", "Status", "Submitted At", "Late", "Max Score", "Score", "File", "Upload"]} rows={rows.map((row) => [
      row.activity,
      row.subject,
      <ActivityFileViewer activityId={row.id} files={row.materials} filePath={(fileIndex) => `/activities/${row.id}/materials/${fileIndex}`} />,
      formatActivityDateTime(row.deadline),
      row.status,
      row.submittedAt ? formatActivityDateTime(row.submittedAt) : "-",
      row.daysLate,
      row.maxScoreAllowed,
      row.score === "" || row.score == null ? "-" : row.score,
      <ActivityFileViewer activityId={row.id} studentId={data.student.id} files={row.files?.length ? row.files : row.fileName ? [{ fileIndex: 0, fileName: row.fileName }] : []} />,
      <div className="activity-upload-box">
        <input value={notes[row.id] ?? row.studentNote ?? ""} onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })} placeholder="Optional note" />
        <label className="soft file-button">{row.fileName ? "Replace File" : "Upload File"}<input type="file" accept={activityFileAccept} multiple disabled={uploadProgress[row.id] != null} onChange={(e) => { uploadSubmission(row.id, e.target.files); e.target.value = ""; }} /></label>
        {uploadProgress[row.id] != null && <div className="activity-upload-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={uploadProgress[row.id]}>
          <span style={{ width: `${uploadProgress[row.id]}%` }} />
          <strong>{uploadProgress[row.id]}%</strong>
        </div>}
      </div>
    ])} />
  </Panel>;
}

const activityFileAccept = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.txt,.csv";

function validateActivityFiles(files) {
  const allowed = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "jpg", "jpeg", "png", "webp", "txt", "csv"];
  if (files.length > 10) throw new Error("Upload up to 10 photos at a time.");
  const imageExtensions = ["jpg", "jpeg", "png", "webp"];
  const extensions = files.map((file) => file.name.split(".").pop()?.toLowerCase() || "");
  if (extensions.some((extension) => !allowed.includes(extension))) throw new Error("Upload PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, JPG/PNG/WEBP, TXT, or CSV only.");
  if (files.length > 1 && extensions.some((extension) => !imageExtensions.includes(extension))) throw new Error("Multiple uploads are only for photos. Upload documents one at a time.");
  if (files.some((file) => file.size > 50 * 1024 * 1024)) throw new Error("Each file must be 50 MB or less.");
  if (files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) throw new Error("Photos are too large together. Maximum total upload is 100 MB.");
}

function formatActivityDateTime(value) {
  const text = String(value || "");
  if (!text) return "-";
  const date = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ? `${text}:00+08:00` : text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleString();
}

export function StudentHistory({ data }) {
  return <DataTable title="My JCoins History" defaultOpen columns={["Date", "Type", "Amount", "Remarks"]} rows={data.transactions.map((t) => [new Date(t.createdAt).toLocaleString(), t.type, t.amount, t.note])} />;
}

export function TeacherProfile({ data }) {
  return <section className="panel"><div className="section-title">Profile</div><p>Assigned subjects: {(data.user.subjectIds || []).map((id) => data.subjects.find((s) => s.id === id)?.name).filter(Boolean).join(", ") || "None"}</p><p>Assigned sections: {(data.user.sectionIds || []).join(", ") || "All sections"}</p></section>;
}

export function Reports({ data }) {
  return <div className="dashboard-grid">
    <Stat title="Recitations" value={data.recitations.length} />
    <Stat title="Purchases" value={data.transactions.filter((t) => t.type === "shop").length} />
    <Stat title="Trades" value={data.transactions.filter((t) => t.type === "trade").length} />
    <Stat title="Activities" value={data.activities.length} />
  </div>;
}

export function Account({ data, role }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const user = data?.user || {};
  const student = data?.student;
  const subjectNames = (user.subjectIds || []).map((id) => data.subjects?.find((subject) => subject.id === id)?.name).filter(Boolean);
  const sections = user.sectionIds?.length ? user.sectionIds.join(", ") : role === "teacher" ? "All assigned students" : student?.section || "All sections";
  const equipped = student?.appearance?.items || {};
  const equippedRows = ["badge", "avatarIcon", "avatarFrame", "background", "border", "nameColor", "nameFont", "effect"]
    .map((type) => [typeLabel(type), equipped[type]?.name || "None"]);

  async function changePassword(e) {
    e.preventDefault();
    if (loading) return;
    setMessage("");
    setError("");
    if (form.newPassword !== form.confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const next = await post("/auth/change-password", { currentPassword: form.currentPassword, newPassword: form.newPassword });
      localStorage.setItem("jcoins_token", next.token);
      localStorage.setItem("jcoins_session", JSON.stringify(next));
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setMessage("Password changed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return <div className="dashboard-grid">
    <Panel title="Login Info" defaultOpen>
      <div className="account-grid">
        <AccountItem label="Username" value={user.username || "Unknown"} />
        <AccountItem label="Role" value={role || user.role || "Unknown"} />
        <AccountItem label="Section" value={sections} />
        <AccountItem label="Temporary Password" value={user.mustChangePassword ? "Active" : "Inactive"} />
        {student && <AccountItem label="Quiz Code" value={student.quizCode || "-"} />}
        {student && <AccountItem label="Current Rank" value={student.rank} />}
        {student && <AccountItem label="Current JCoins" value={`${student.currentJCoins?.toLocaleString?.() || 0} JC`} />}
      </div>
    </Panel>
    <Panel title="Change Password" defaultOpen>
      <form className="account-form" onSubmit={changePassword} aria-busy={loading}>
        <Field label="Current Password" type="password" value={form.currentPassword} onChange={(currentPassword) => setForm({ ...form, currentPassword })} />
        <Field label="New Password" type="password" value={form.newPassword} onChange={(newPassword) => setForm({ ...form, newPassword })} />
        <Field label="Confirm New Password" type="password" value={form.confirmPassword} onChange={(confirmPassword) => setForm({ ...form, confirmPassword })} />
        {error && <div className="error">{error}</div>}
        {message && <div className="notice">{message}</div>}
        <button disabled={loading}>{loading ? "Saving..." : "Save Password"}</button>
      </form>
    </Panel>
    {student && <Panel title="Equipped Appearance" defaultOpen>
      <Table columns={["Category", "Equipped"]} rows={equippedRows} />
    </Panel>}
    {role !== "student" && <Panel title="Teacher/Admin Access" defaultOpen>
      <div className="account-grid">
        <AccountItem label="Assigned Subjects" value={subjectNames.join(", ") || (role === "admin" ? "All subjects" : "None")} />
        <AccountItem label="Assigned Sections" value={sections} />
        <AccountItem label="Permissions" value={role === "admin" ? "Manage all students, settings, shops, approvals, and cosmetics" : "View and manage assigned students only"} />
      </div>
    </Panel>}
  </div>;
}

function AccountItem({ label, value }) {
  return <div className="account-item"><span>{label}</span><strong>{value}</strong></div>;
}

function typeLabel(type) {
  return {
    badge: "Badge / Title",
    avatarIcon: "Avatar Icon",
    avatarFrame: "Avatar Frame",
    background: "Background",
    border: "Border",
    nameColor: "Name Color",
    nameFont: "Name Font",
    effect: "Effect"
  }[type] || type;
}

function rankClass(rank = "") {
  return `rank-${rank.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unranked"}`;
}
