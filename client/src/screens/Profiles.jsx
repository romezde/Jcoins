import React, { useState } from "react";
import { Sparkles } from "lucide-react";
import { DataTable, Field, Panel, Stat, Table } from "../components/ui.jsx";

export function StudentProfile({ data }) {
  const needed = Math.max(0, Number(data.student.nextTarget || 0) - Number(data.student.currentJCoins || 0));
  return <div className="dashboard-grid">
    <section className={`profile-card wide ${rankClass(data.student.rank)}`}>
      <Sparkles />
      <h1>{data.student.name}</h1>
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
  return <section className="panel"><div className="section-title">Profile</div><p>Assigned subjects: {(data.user.subjectIds || []).map((id) => data.subjects.find((s) => s.id === id)?.name).filter(Boolean).join(", ") || "None"}</p><p>Assigned sections: {(data.user.sectionIds || []).join(", ") || "All sections"}</p><Account /></section>;
}

export function Reports({ data }) {
  return <div className="dashboard-grid">
    <Stat title="Recitations" value={data.recitations.length} />
    <Stat title="Purchases" value={data.transactions.filter((t) => t.type === "shop").length} />
    <Stat title="Trades" value={data.transactions.filter((t) => t.type === "trade").length} />
    <Stat title="Activities" value={data.activities.length} />
  </div>;
}

export function Account() {
  return <section className="panel"><div className="section-title">Account</div><p>Password changes are available when logging in with a temporary password. A full account page can be expanded after the prototype rules are settled.</p></section>;
}

function rankClass(rank = "") {
  return `rank-${rank.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unranked"}`;
}
