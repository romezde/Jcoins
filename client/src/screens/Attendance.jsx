import React, { useMemo, useState } from "react";
import { del, post, put, today } from "../api.js";
import { ActionModal, Field, Panel, Select } from "../components/ui.jsx";
import { exportSpreadsheet, safeFilePart } from "../utils/exportSpreadsheet.js";

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
        <button type="button" onClick={() => exportAttendanceMonth(currentGroup, data, exportFilter)}>Export Month Spreadsheet</button>
      </div>
    </section>}
    {visibleWeeks.map((w, index) => <Panel title={attendanceWeekTitle(w)} wide defaultOpen={index === 0} key={w.id} actions={<div className="inline"><input type="date" value={dateByWeek[w.id] || today()} onChange={(e) => setDateByWeek({ ...dateByWeek, [w.id]: e.target.value })} /><button onClick={() => run(() => post(`/admin/attendance/weeks/${w.id}/dates`, { date: dateByWeek[w.id] || today() }), "Date added")}>Add Date</button><button className="danger" onClick={() => confirm(`Delete ${w.title}? This removes all dates, attendance records, and JCoins for this week.`) && run(() => del(`/admin/attendance/weeks/${w.id}`), "Week deleted")}>Delete Week</button></div>}>
      <AttendanceTable week={w} data={data} run={run} />
    </Panel>)}
    {!monthGroups.length && <section className="panel wide">No attendance weeks yet.</section>}
  </div>;
}

function weekSortValue(week) {
  return weekMonthDate(week) || week.createdAt || "";
}

function attendanceWeekTitle(week) {
  const range = attendanceWeekRange(week);
  return `${week.subjectName}: ${week.title}${range ? ` ${range}` : ""}`;
}

function attendanceWeekRange(week) {
  const dates = [...(week.dates || [])].sort();
  if (!dates.length) return "";
  const start = formatShortDate(dates[0]);
  const end = formatShortDate(dates[dates.length - 1]);
  return start === end ? start : `${start} - ${end}`;
}

function formatShortDate(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-");
  return month && day ? `${month}/${day}` : value;
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
  const dates = [...new Set(weeks.flatMap((week) => week.dates || []))].sort();
  const headers = ["Name", ...dates, "Days Present", "Days Late", "Days Absent", "Total JCoins Earned"];
  const includeSubject = filter.subjectId === "all";
  const includeSection = filter.section === "all";
  if (includeSection) headers.splice(0, 0, "Section");
  if (includeSubject) headers.splice(0, 0, "Subject");
  const subjectWeeks = new Map();
  weeks.forEach((week) => {
    if (!subjectWeeks.has(week.subjectId)) subjectWeeks.set(week.subjectId, []);
    subjectWeeks.get(week.subjectId).push(week);
  });
  const rows = [];
  subjectWeeks.forEach((weeksForSubject, subjectId) => {
    const subjectName = weeksForSubject[0]?.subjectName || data.subjects.find((subject) => subject.id === subjectId)?.name || "Subject";
    data.students
      .filter((student) => (student.subjectIds || []).includes(subjectId))
      .filter((student) => filter.section === "all" || (filter.section === "__none" ? !student.section : student.section === filter.section))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .forEach((student) => {
      const row = [];
      if (includeSubject) row.push(subjectName);
      if (includeSection) row.push(student.section || "No section");
      row.push(student.name);
      const summary = { present: 0, late: 0, absent: 0, earned: 0 };
      dates.forEach((date) => row.push(attendanceExportCell(data, weeksForSubject, student.id, date, summary)));
      row.push(
        { value: summary.present, className: "summary" },
        { value: summary.late, className: "summary" },
        { value: summary.absent, className: "summary" },
        { value: summary.earned, className: "summary" }
      );
      rows.push(row);
    });
  });
  const nameIndex = (includeSubject ? 1 : 0) + (includeSection ? 1 : 0);
  rows.sort((a, b) => String(exportCellValue(a[nameIndex])).localeCompare(String(exportCellValue(b[nameIndex]))) || String(exportCellValue(a[0])).localeCompare(String(exportCellValue(b[0]))));
  const subjectLabel = filter.subjectId === "all" ? "all-subjects" : data.subjects.find((subject) => subject.id === filter.subjectId)?.name || "subject";
  const sectionLabel = filter.section === "all" ? "all-sections" : filter.section === "__none" ? "no-section" : `section-${filter.section}`;
  exportSpreadsheet(`attendance-${safeFilePart(group.label)}-${safeFilePart(subjectLabel)}-${safeFilePart(sectionLabel)}.xls`, headers, rows, group.label);
}

function exportCellValue(cell) {
  return cell && typeof cell === "object" && "value" in cell ? cell.value : cell;
}

function attendanceExportCell(data, weeks, studentId, date, summary) {
  const week = weeks.find((item) => (item.dates || []).includes(date));
  if (!week) return "";
  const status = data.attendanceRecords.find((r) => r.weekId === week.id && r.studentId === studentId && r.date === date)?.status || "";
  if (status === "check") {
    summary.present += 1;
    summary.earned += Number(data.settings.attendance.onTimePoints || 0);
    return { value: "\u2713", className: "present" };
  }
  if (status === "late") {
    summary.present += 1;
    summary.late += 1;
    summary.earned += Number(data.settings.attendance.latePoints || 0);
    return { value: "-", className: "late" };
  }
  summary.absent += 1;
  return { value: "", className: "absent" };
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
