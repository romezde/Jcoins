import React, { useState } from "react";
import { Sparkles } from "lucide-react";
import { post } from "../api.js";
import CosmeticFx from "../components/CosmeticFx.jsx";
import { DataTable, Field, Panel, Stat, Table } from "../components/ui.jsx";

export function StudentProfile({ data }) {
  const needed = Math.max(0, Number(data.student.nextTarget || 0) - Number(data.student.currentJCoins || 0));
  const appearanceClasses = data.student.appearance?.classes?.join(" ") || "";
  const badge = data.student.appearance?.items?.badge?.name;
  const avatarIcon = data.student.appearance?.items?.avatarIcon?.icon;
  return <div className="dashboard-grid">
    <section className={`profile-card wide appearance-card ${appearanceClasses} ${rankClass(data.student.rank)}`}>
      <CosmeticFx classes={appearanceClasses} />
      <div className="cosmetic-avatar profile-avatar">{avatarIcon || <Sparkles />}</div>
      <h1 className="cosmetic-name">{data.student.name}</h1>
      {badge && <div className="cosmetic-badge">{badge}</div>}
      <div className="big-coins">{data.student.currentJCoins.toLocaleString()} JCoins</div>
      <div className="rank-pill rank-chip">{data.student.rank}</div>
      <div className="bar"><div className="fill" style={{ width: `${data.student.progress}%` }} /></div>
      <p>{data.student.progress}% to {data.student.nextRank}</p>
      <p className="needed-coins">{needed ? `${needed.toLocaleString()} JCoins needed to reach ${data.student.nextRank}` : "Max rank reached"}</p>
    </section>
    <DataTable title="Attendance / Recitation Weekly Bonuses" defaultOpen columns={["Week", "Subject", "Attendance Bonus", "Recitation Bonus"]} rows={data.weeks.map((w) => [w.title, w.subjectName, w.attendanceBonus ? "Earned" : "Not yet", w.recitationBonus ? "Earned" : "Not yet"])} />
    <DataTable title="Recent JCoins History" columns={["Date", "Type", "Amount", "Remarks"]} rows={data.transactions.map((t) => [new Date(t.createdAt).toLocaleString(), t.type, t.amount, t.note])} />
  </div>;
}

export function StudentActivities({ data }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const rows = data.activities.flatMap((activity) => activity.rows.filter((row) => row.studentId === data.student.id).map((row) => ({
    activity: activity.title,
    subject: activity.subjectName,
    deadline: activity.deadline,
    status: row.submitted ? "Submitted" : "Pending",
    daysLate: row.daysLate,
    earned: row.earned
  }))).filter((row) => !q || Object.values(row).some((value) => String(value || "").toLowerCase().includes(q)));
  return <Panel title="My Activities" wide defaultOpen>
    <div className="filter-bar">
      <Field label="Search Activities" value={search} onChange={setSearch} />
      <div className="filter-count">{rows.length} activit{rows.length === 1 ? "y" : "ies"}</div>
    </div>
    <Table columns={["Activity", "Subject", "Deadline", "Submitted", "Days Late", "Earned"]} rows={rows.map((row) => [row.activity, row.subject, row.deadline, row.status, row.daysLate, row.earned])} />
  </Panel>;
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
  const user = data?.user || {};
  const student = data?.student;
  const subjectNames = (user.subjectIds || []).map((id) => data.subjects?.find((subject) => subject.id === id)?.name).filter(Boolean);
  const sections = user.sectionIds?.length ? user.sectionIds.join(", ") : role === "teacher" ? "All assigned students" : student?.section || "All sections";
  const equipped = student?.appearance?.items || {};
  const equippedRows = ["badge", "avatarIcon", "avatarFrame", "background", "border", "nameColor", "nameFont", "effect"]
    .map((type) => [typeLabel(type), equipped[type]?.name || "None"]);

  async function changePassword(e) {
    e.preventDefault();
    setMessage("");
    setError("");
    if (form.newPassword !== form.confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    try {
      const next = await post("/auth/change-password", { currentPassword: form.currentPassword, newPassword: form.newPassword });
      localStorage.setItem("jcoins_token", next.token);
      localStorage.setItem("jcoins_session", JSON.stringify(next));
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setMessage("Password changed.");
    } catch (err) {
      setError(err.message);
    }
  }

  return <div className="dashboard-grid">
    <Panel title="Login Info" defaultOpen>
      <div className="account-grid">
        <AccountItem label="Username" value={user.username || "Unknown"} />
        <AccountItem label="Role" value={role || user.role || "Unknown"} />
        <AccountItem label="Section" value={sections} />
        <AccountItem label="Temporary Password" value={user.mustChangePassword ? "Active" : "Inactive"} />
        {student && <AccountItem label="Current Rank" value={student.rank} />}
        {student && <AccountItem label="Current JCoins" value={`${student.currentJCoins?.toLocaleString?.() || 0} JC`} />}
      </div>
    </Panel>
    <Panel title="Change Password" defaultOpen>
      <form className="account-form" onSubmit={changePassword}>
        <Field label="Current Password" type="password" value={form.currentPassword} onChange={(currentPassword) => setForm({ ...form, currentPassword })} />
        <Field label="New Password" type="password" value={form.newPassword} onChange={(newPassword) => setForm({ ...form, newPassword })} />
        <Field label="Confirm New Password" type="password" value={form.confirmPassword} onChange={(confirmPassword) => setForm({ ...form, confirmPassword })} />
        {error && <div className="error">{error}</div>}
        {message && <div className="notice">{message}</div>}
        <button>Save Password</button>
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
