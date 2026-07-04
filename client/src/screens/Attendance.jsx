import React, { useEffect, useMemo, useState } from "react";
import { del, post, put, today } from "../api.js";
import { ActionModal, Field, Panel, Select } from "../components/ui.jsx";
import SubjectSectionPicker, { buildSubjectSectionClasses } from "../components/SubjectSectionPicker.jsx";
import { exportSpreadsheet, safeFilePart } from "../utils/exportSpreadsheet.js";

export default function Attendance({ data, run, role }) {
  const [week, setWeek] = useState({ subjectId: data.subjects[0]?.id || "", section: data.sections?.[0] || "", title: "Week 1", firstDate: today() });
  const [dateByWeek, setDateByWeek] = useState({});
  const [activeMonth, setActiveMonth] = useState("");
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [weekSearch, setWeekSearch] = useState("");
  const sortedWeeks = [...data.attendanceWeeks].sort((a, b) => weekSortValue(b).localeCompare(weekSortValue(a)));
  const attendanceClasses = useMemo(() => buildSubjectSectionClasses(data, (subjectId, section) => (data.attendanceWeeks || []).filter((week) => week.subjectId === subjectId && (!week.section || week.section === section)).length), [data.subjects, data.students, data.attendanceWeeks]);
  const activeClass = attendanceClasses.find((item) => item.key === selectedClassKey) || null;
  const filteredWeeks = useMemo(() => activeClass
    ? filterAttendanceWeeks(sortedWeeks, activeClass.subjectId, activeClass.section, weekSearch)
    : [], [data.attendanceWeeks, activeClass?.key, weekSearch]);
  const monthGroups = useMemo(() => groupWeeksByMonth(filteredWeeks), [filteredWeeks]);
  const currentMonth = activeMonth && monthGroups.some((group) => group.key === activeMonth) ? activeMonth : monthGroups[0]?.key || "";
  const currentGroup = monthGroups.find((group) => group.key === currentMonth);
  const visibleWeeks = currentGroup?.weeks || [];
  const canManageWeeks = role !== "student";
  function openWeekForClass() {
    if (!activeClass) return;
    setWeek((current) => ({ ...current, subjectId: activeClass.subjectId, section: activeClass.section }));
    window.setTimeout(() => window.dispatchEvent(new Event("jcoins:open-attendance-week-modal")), 0);
  }

  return <div className="dashboard-grid">
    {canManageWeeks && <ActionModal title="Add Attendance Week" openEvent="jcoins:open-attendance-week-modal">
      <form onSubmit={(e) => { e.preventDefault(); run(() => post("/admin/attendance/weeks", week), "Week added"); }}>
        <Select label="Subject" value={week.subjectId} onChange={(v) => setWeek({ ...week, subjectId: v })} options={data.subjects} />
        <Select label="Section" value={week.section} onChange={(v) => setWeek({ ...week, section: v })} options={(data.sections || []).map((section) => ({ value: section, label: section }))} />
        <Field label="Week Title" value={week.title} onChange={(v) => setWeek({ ...week, title: v })} />
        <Field label="First Date" type="date" value={week.firstDate} onChange={(v) => setWeek({ ...week, firstDate: v })} />
        <button>Add Week</button>
      </form>
    </ActionModal>}
    <SubjectSectionPicker classes={attendanceClasses} selectedKey={selectedClassKey} onSelect={(key) => { const chosen = attendanceClasses.find((item) => item.key === key); setSelectedClassKey(key); setActiveMonth(""); if (chosen) setWeek((current) => ({ ...current, subjectId: chosen.subjectId, section: chosen.section })); }} title="Attendance Classes" itemLabel="weeks" />
    {activeClass && <section className="panel wide attendance-month-panel">
      <div className="section-head">
        <div className="section-title">{activeClass.subjectName} · {activeClass.sectionLabel}</div>
        <div className="inline">
          <span className="filter-count">{visibleWeeks.length} week{visibleWeeks.length === 1 ? "" : "s"}</span>
          {canManageWeeks && <button type="button" onClick={openWeekForClass}>Add Week to This Class</button>}
        </div>
      </div>
      {monthGroups.length > 0 && <div className="tabs attendance-month-tabs">
        {monthGroups.map((group) => <button type="button" key={group.key} className={currentMonth === group.key ? "active" : ""} onClick={() => setActiveMonth(group.key)}>{group.label}</button>)}
      </div>}
      <div className="filter-bar attendance-week-toolbar">
        <Field label="Search Weeks" value={weekSearch} onChange={setWeekSearch} />
        <button type="button" disabled={!currentGroup} onClick={() => exportAttendanceMonth(currentGroup, data, { subjectId: activeClass.subjectId, section: activeClass.section })}>Export This Class</button>
      </div>
    </section>}
    {visibleWeeks.map((w, index) => <Panel title={attendanceWeekTitle(w)} wide defaultOpen={index === 0} key={w.id} actions={canManageWeeks ? <div className="inline"><input type="date" value={dateByWeek[w.id] || today()} onChange={(e) => setDateByWeek({ ...dateByWeek, [w.id]: e.target.value })} /><button onClick={() => run(() => post(`/admin/attendance/weeks/${w.id}/dates`, { date: dateByWeek[w.id] || today() }), "Date added")}>Add Date</button><button className="danger" onClick={() => confirm(`Delete ${w.title}? This removes all dates, attendance records, and JCoins for this week.`) && run(() => del(`/admin/attendance/weeks/${w.id}`), "Week deleted")}>Delete Week</button></div> : null}>
      <AttendanceTable week={w} section={activeClass.section} data={data} run={run} canManageWeeks={canManageWeeks} />
    </Panel>)}
    {!activeClass && <section className="panel wide attendance-empty">Choose a subject and section above to view its attendance weeks.</section>}
    {activeClass && !monthGroups.length && <section className="panel wide attendance-empty">No attendance weeks found for this class.</section>}
  </div>;
}

function filterAttendanceWeeks(weeks, subjectId, section, search) {
  const q = String(search || "").trim().toLowerCase();
  return weeks.filter((week) => {
    if (week.subjectId !== subjectId) return false;
    if (week.section && week.section !== section) return false;
    if (!q) return true;
    return [
      week.title,
      week.subjectName,
      attendanceWeekRange(week),
      ...(week.dates || [])
    ].some((value) => String(value || "").toLowerCase().includes(q));
  });
}

function weekSortValue(week) {
  return weekMonthDate(week) || week.createdAt || "";
}

function attendanceWeekTitle(week) {
  const range = attendanceWeekRange(week);
  return `${week.subjectName}: ${week.title}${range ? ` ${range}` : ""}${week.scheduleLinked ? " · Scheduled" : ""}`;
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
  const headers = ["Name", ...dates, "Days Present", "Days Late", "Days Excused", "Days Absent", "Total JCoins Earned"];
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
      const summary = { present: 0, late: 0, excused: 0, absent: 0, earned: 0 };
      dates.forEach((date) => row.push(attendanceExportCell(data, weeksForSubject, student.id, date, summary)));
      row.push(
        { value: summary.present, className: "summary" },
        { value: summary.late, className: "summary" },
        { value: summary.excused, className: "summary" },
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
  if ((week.cancelledDates || []).includes(date)) return { value: "Holiday / Cancelled", className: "summary" };
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
  if (status === "excused") {
    summary.present += 1;
    summary.excused += 1;
    summary.earned += Number(data.settings.attendance.latePoints || 0);
    return { value: "Excused", className: "late" };
  }
  summary.absent += 1;
  return { value: "", className: "absent" };
}

function AttendanceTable({ week, section, data, run, canManageWeeks }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "name", date: "", direction: "asc" });
  const [pendingStatuses, setPendingStatuses] = useState({});
  // data.students is already role-scoped by the server for teachers.
  const q = search.trim().toLowerCase();
  const cancelledDates = new Set(week.cancelledDates || []);
  const statusKey = (studentId, date) => `${studentId}|${date}`;
  const savedStatus = (studentId, date) => data.attendanceRecords.find((r) => r.weekId === week.id && r.studentId === studentId && r.date === date)?.status || "";
  const status = (studentId, date) => {
    const key = statusKey(studentId, date);
    return Object.prototype.hasOwnProperty.call(pendingStatuses, key) ? pendingStatuses[key] : savedStatus(studentId, date);
  };
  useEffect(() => {
    setPendingStatuses((current) => {
      const next = { ...current };
      let changed = false;
      Object.entries(current).forEach(([key, value]) => {
        const separator = key.lastIndexOf("|");
        const studentId = key.slice(0, separator);
        const date = key.slice(separator + 1);
        if (savedStatus(studentId, date) === value) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [data.attendanceRecords, week.id]);
  async function saveStatus(studentId, date, nextStatus) {
    const key = statusKey(studentId, date);
    setPendingStatuses((current) => ({ ...current, [key]: nextStatus }));
    const saved = await run(() => put("/admin/attendance/records", { weekId: week.id, date, studentId, status: nextStatus }), "Attendance saved");
    if (!saved) {
      setPendingStatuses((current) => {
        if (current[key] !== nextStatus) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }
  const students = data.students
    .filter((s) => (s.subjectIds || []).includes(week.subjectId) && String(s.section || "") === section && (!q || [s.name, s.username, s.section, s.rank].some((value) => String(value || "").toLowerCase().includes(q))))
    .sort((a, b) => compareAttendanceStudents(a, b, sort, status));
  function toggleSort(next) {
    setSort((current) => current.key === next.key && current.date === (next.date || "")
      ? { ...next, date: next.date || "", direction: current.direction === "asc" ? "desc" : "asc" }
      : { ...next, date: next.date || "", direction: "asc" });
  }
  const sortMark = (key, date = "") => sort.key === key && sort.date === date ? sort.direction === "asc" ? "↑" : "↓" : "↕";
  return <>
    <div className="filter-bar">
      <Field label="Search Students" value={search} onChange={setSearch} />
      <div className="filter-count">{students.length} student{students.length === 1 ? "" : "s"}</div>
    </div>
    <div className="table-wrap attendance-table-wrap"><table className="attendance-grid-table"><thead><tr><th><button type="button" className="table-sort-button" onClick={() => toggleSort({ key: "name" })}>Student {sortMark("name")}</button></th>{(week.dates || []).map((d) => {
      const cancelled = cancelledDates.has(d);
      return <th key={d}><button type="button" className="table-sort-button" onClick={() => toggleSort({ key: "date", date: d })}>{d} {sortMark("date", d)}</button>{cancelled && <div className="attendance-cancelled-label">Holiday / Cancelled</div>}<div className="mini-actions">{!cancelled && <><button onClick={() => run(() => post("/admin/attendance/check-all", { weekId: week.id, date: d, status: "check", section }))}>Check All</button><button onClick={() => run(() => post("/admin/attendance/check-all", { weekId: week.id, date: d, status: "", section }))}>Uncheck</button></>}{canManageWeeks && <button type="button" className={cancelled ? "soft" : "danger"} onClick={() => run(() => put(`/admin/attendance/weeks/${week.id}/dates/${encodeURIComponent(d)}/cancelled`, { cancelled: !cancelled }), cancelled ? "Class date restored" : "Marked Holiday / Cancelled")}>{cancelled ? "Restore Class" : "Holiday / Cancelled"}</button>}{canManageWeeks && <button className="danger" onClick={() => confirm(`Delete attendance date ${d}? This removes records and JCoins for this date.`) && run(() => del(`/admin/attendance/weeks/${week.id}/dates/${encodeURIComponent(d)}`), "Date deleted")}>Delete Date</button>}</div></th>;
    })}</tr></thead><tbody>{students.map((s) => <tr key={s.id}><td>{s.name}</td>{(week.dates || []).map((d) => <td key={d}>{cancelledDates.has(d) ? <span className="attendance-cancelled-cell">Holiday / Cancelled</span> : <select value={status(s.id, d)} onChange={(e) => saveStatus(s.id, d, e.target.value)}><option value="">Absent</option><option value="check">On Time</option><option value="late">Late</option><option value="excused">Excused</option></select>}</td>)}</tr>)}</tbody></table></div>
  </>;
}

function compareAttendanceStudents(a, b, sort, status) {
  const direction = sort.direction === "desc" ? -1 : 1;
  if (sort.key === "date") {
    const order = { "": 0, excused: 1, late: 2, check: 3 };
    const diff = (order[status(a.id, sort.date)] ?? 0) - (order[status(b.id, sort.date)] ?? 0);
    if (diff) return diff * direction;
  }
  return String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true, sensitivity: "base" }) * direction;
}
