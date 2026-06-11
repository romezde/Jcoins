import React, { useMemo, useState } from "react";
import { del, post, put, today } from "../api.js";
import { ActionModal, Field, Panel, Select } from "../components/ui.jsx";
import { exportCsv, safeFilePart } from "../utils/exportCsv.js";

export default function Attendance({ data, run }) {
  const [week, setWeek] = useState({ subjectId: data.subjects[0]?.id || "", title: "Week 1", firstDate: today() });
  const [dateByWeek, setDateByWeek] = useState({});
  const [activeMonth, setActiveMonth] = useState("");
  const [exportFilter, setExportFilter] = useState({ subjectId: "all", section: "all" });
  const sortedWeeks = [...data.attendanceWeeks].sort((a, b) => weekSortValue(b).localeCompare(weekSortValue(a)));
  const monthGroups = useMemo(() => groupWeeksByMonth(sortedWeeks), [data.attendanceWeeks]);
  const currentMonth = activeMonth && monthGroups.some((group) => group.key === activeMonth) ? activeMonth : monthGroups[0]?.key || "";
  const currentGroup = monthGroups.find((group) => group.key === currentMonth);
  const visibleWeeks = currentGroup?.weeks || [];
  const sections = [...new Set((data.students || []).map((student) => student.section).filter(Boolean))].sort();

  return <div className="dashboard-grid">
    <ActionModal title="Add Attendance Week">
      <form onSubmit={(e) => { e.preventDefault(); run(() => post("/admin/attendance/weeks", week), "Week added"); }}>
        <Select label="Subject" value={week.subjectId} onChange={(v) => setWeek({ ...week, subjectId: v })} options={data.subjects} />
        <Field label="Week Title" value={week.title} onChange={(v) => setWeek({ ...week, title: v })} />
        <Field label="First Date" type="date" value={week.firstDate} onChange={(v) => setWeek({ ...week, firstDate: v })} />
        <button>Add Week</button>
      </form>
    </ActionModal>
    {monthGroups.length > 0 && <section className="panel wide attendance-month-panel">
      <div className="section-head">
        <div className="section-title">Attendance Month</div>
        <span className="filter-count">{visibleWeeks.length} week{visibleWeeks.length === 1 ? "" : "s"}</span>
      </div>
      <div className="tabs attendance-month-tabs">
        {monthGroups.map((group) => <button type="button" key={group.key} className={currentMonth === group.key ? "active" : ""} onClick={() => setActiveMonth(group.key)}>{group.label}</button>)}
      </div>
      <div className="filter-bar transaction-filter-bar">
        <Select label="Export Subject" value={exportFilter.subjectId} onChange={(subjectId) => setExportFilter({ ...exportFilter, subjectId })} options={[{ value: "all", label: "All subjects" }, ...data.subjects.map((subject) => ({ value: subject.id, label: subject.name }))]} />
        <Select label="Export Section" value={exportFilter.section} onChange={(section) => setExportFilter({ ...exportFilter, section })} options={[{ value: "all", label: "All sections" }, ...sections.map((section) => ({ value: section, label: `Section ${section}` })), ...((data.students || []).some((student) => !student.section) ? [{ value: "__none", label: "No section" }] : [])]} />
        <button type="button" onClick={() => exportAttendanceMonth(currentGroup, data, exportFilter)}>Export Month CSV</button>
      </div>
    </section>}
    {visibleWeeks.map((w, index) => <Panel title={`${w.subjectName}: ${w.title}`} wide defaultOpen={index === 0} key={w.id} actions={<div className="inline"><input type="date" value={dateByWeek[w.id] || today()} onChange={(e) => setDateByWeek({ ...dateByWeek, [w.id]: e.target.value })} /><button onClick={() => run(() => post(`/admin/attendance/weeks/${w.id}/dates`, { date: dateByWeek[w.id] || today() }), "Date added")}>Add Date</button><button className="danger" onClick={() => confirm(`Delete ${w.title}? This removes all dates, attendance records, and JCoins for this week.`) && run(() => del(`/admin/attendance/weeks/${w.id}`), "Week deleted")}>Delete Week</button></div>}>
      <AttendanceTable week={w} data={data} run={run} />
    </Panel>)}
    {!monthGroups.length && <section className="panel wide">No attendance weeks yet.</section>}
  </div>;
}

function weekSortValue(week) {
  return weekMonthDate(week) || week.createdAt || "";
}

function weekMonthDate(week) {
  return [...(week.dates || [])].sort()[0] || week.createdAt || "";
}

function groupWeeksByMonth(weeks) {
  const map = new Map();
  weeks.forEach((week) => {
    const raw = weekMonthDate(week);
    const date = raw ? new Date(`${String(raw).slice(0, 10)}T00:00:00`) : new Date();
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleString(undefined, { month: "long", year: "numeric" });
    if (!map.has(key)) map.set(key, { key, label, weeks: [] });
    map.get(key).weeks.push(week);
  });
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
}

function exportAttendanceMonth(group, data, filter) {
  if (!group) return;
  const weeks = group.weeks.filter((week) => filter.subjectId === "all" || week.subjectId === filter.subjectId);
  const rows = [];
  weeks.forEach((week) => {
    const students = data.students
      .filter((student) => (student.subjectIds || []).includes(week.subjectId))
      .filter((student) => filter.section === "all" || (filter.section === "__none" ? !student.section : student.section === filter.section));
    const dates = week.dates?.length ? week.dates : [""];
    students.forEach((student) => {
      dates.forEach((date) => {
        const record = data.attendanceRecords.find((r) => r.weekId === week.id && r.studentId === student.id && r.date === date);
        const status = record?.status || "";
        rows.push([
          group.label,
          week.subjectName,
          student.section || "",
          week.title,
          student.name,
          date,
          statusLabel(status),
          attendancePoints(status, data.settings)
        ]);
      });
    });
  });
  const subjectLabel = filter.subjectId === "all" ? "all-subjects" : data.subjects.find((subject) => subject.id === filter.subjectId)?.name || "subject";
  const sectionLabel = filter.section === "all" ? "all-sections" : filter.section === "__none" ? "no-section" : `section-${filter.section}`;
  exportCsv(`attendance-${safeFilePart(group.label)}-${safeFilePart(subjectLabel)}-${safeFilePart(sectionLabel)}.csv`, ["Month", "Subject", "Section", "Week", "Student", "Date", "Status", "JCoins"], rows);
}

function statusLabel(status) {
  if (status === "check") return "On Time";
  if (status === "late") return "Late";
  return "Absent";
}

function attendancePoints(status, settings) {
  if (status === "check") return settings.attendance.onTimePoints;
  if (status === "late") return settings.attendance.latePoints;
  return 0;
}

function AttendanceTable({ week, data, run }) {
  const [search, setSearch] = useState("");
  // data.students is already role-scoped by the server for teachers.
  const q = search.trim().toLowerCase();
  const students = data.students.filter((s) => (s.subjectIds || []).includes(week.subjectId) && (!q || [s.name, s.username, s.section, s.rank].some((value) => String(value || "").toLowerCase().includes(q))));
  const status = (studentId, date) => data.attendanceRecords.find((r) => r.weekId === week.id && r.studentId === studentId && r.date === date)?.status || "";
  return <>
    <div className="filter-bar">
      <Field label="Search Students" value={search} onChange={setSearch} />
      <div className="filter-count">{students.length} student{students.length === 1 ? "" : "s"}</div>
    </div>
    <div className="table-wrap"><table><thead><tr><th>Student</th>{week.dates.map((d) => <th key={d}>{d}<div className="mini-actions"><button onClick={() => run(() => post("/admin/attendance/check-all", { weekId: week.id, date: d, status: "check" }))}>Check All</button><button onClick={() => run(() => post("/admin/attendance/check-all", { weekId: week.id, date: d, status: "" }))}>Uncheck</button><button className="danger" onClick={() => confirm(`Delete attendance date ${d}? This removes records and JCoins for this date.`) && run(() => del(`/admin/attendance/weeks/${week.id}/dates/${encodeURIComponent(d)}`), "Date deleted")}>Delete Date</button></div></th>)}</tr></thead><tbody>{students.map((s) => <tr key={s.id}><td>{s.name}</td>{week.dates.map((d) => <td key={d}><select value={status(s.id, d)} onChange={(e) => run(() => put("/admin/attendance/records", { weekId: week.id, date: d, studentId: s.id, status: e.target.value }), "Attendance saved")}><option value="">Absent</option><option value="check">On Time</option><option value="late">Late</option></select></td>)}</tr>)}</tbody></table></div>
  </>;
}
