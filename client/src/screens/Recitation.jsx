import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { post, today } from "../api.js";
import { StudentFilterFields, StudentMultiPicker, studentMatchesFilters } from "../components/StudentMultiPicker.jsx";
import SubjectSectionPicker, { buildSubjectSectionClasses } from "../components/SubjectSectionPicker.jsx";
import { ActionModal, Field, Panel, Select, Table } from "../components/ui.jsx";
import { exportSpreadsheet, safeFilePart } from "../utils/exportSpreadsheet.js";

export default function Recitation({ data, run }) {
  const [form, setForm] = useState({ studentIds: [], subjectId: data.subjects[0]?.id || "", date: today(), amount: 1, remarks: "" });
  const [filter, setFilter] = useState({ subjectId: "all", studentId: "all", section: "all", guildId: "all", week: "all", search: "" });
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [participationSearch, setParticipationSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const amounts = Array.from({ length: data.settings.recitation.maxPoints }, (_, i) => ({ value: i + 1, label: i + 1 }));
  const weekOptions = buildRecitationWeeks(data.recitations);
  const studentById = new Map(data.students.map((student) => [student.id, student]));
  const eligibleStudents = useMemo(() => data.students.filter((student) => !form.subjectId || (student.subjectIds || []).includes(form.subjectId)), [data.students, form.subjectId]);
  const classes = useMemo(() => buildSubjectSectionClasses(data, (subjectId, section) => recitationCountForClass(data, subjectId, section)), [data.subjects, data.students, data.recitations]);
  const activeClass = classes.find((item) => item.key === selectedClassKey) || null;
  const participation = useMemo(() => buildClassParticipation(data, activeClass), [data.students, data.recitations, activeClass?.key]);
  const participationRows = participation.rows.filter((row) => row.studentName.toLowerCase().includes(participationSearch.trim().toLowerCase()));
  const selectedProfile = selectedStudentId ? buildStudentParticipationProfile(participation, selectedStudentId) : null;
  useEffect(() => {
    if (!classes.length) {
      setSelectedClassKey("");
      return;
    }
    if (!classes.some((item) => item.key === selectedClassKey)) setSelectedClassKey(classes[0].key);
  }, [classes, selectedClassKey]);
  useEffect(() => setSelectedStudentId(""), [selectedClassKey]);
  useEffect(() => {
    const prefill = (event) => {
      const detail = event.detail || {};
      const query = String(detail.studentQuery || "").trim().toLowerCase();
      const matches = query ? data.students.filter((student) => student.name.toLowerCase().includes(query)) : [];
      const selectedSubjectId = matches[0]?.subjectIds?.includes(form.subjectId)
        ? form.subjectId
        : matches[0]?.subjectIds?.[0] || form.subjectId || data.subjects[0]?.id || "";
      const amount = Math.max(1, Math.min(Number(detail.amount || form.amount || 1), Number(data.settings.recitation.maxPoints || 1)));
      setForm((current) => ({
        ...current,
        subjectId: selectedSubjectId,
        studentIds: matches.map((student) => student.id),
        amount,
        remarks: detail.remarks || current.remarks
      }));
    };
    window.addEventListener("jcoins:prefill-recitation", prefill);
    return () => window.removeEventListener("jcoins:prefill-recitation", prefill);
  }, [data.students, data.subjects, data.settings.recitation.maxPoints, form.amount, form.subjectId]);
  const filteredRecitations = data.recitations.filter((recitation) => {
    const subjectMatch = filter.subjectId === "all" || recitation.subjectId === filter.subjectId;
    const studentMatch = filter.studentId === "all" || recitation.studentId === filter.studentId;
    const targetMatch = studentMatchesFilters(data, studentById.get(recitation.studentId), filter, { includeSubject: false, includeSearch: false });
    const weekMatch = filter.week === "all" || weekKey(recitation.date) === filter.week;
    const q = filter.search.trim().toLowerCase();
    const searchMatch = !q || [recitation.date, recitation.studentName, recitation.subjectName, recitation.amount, recitation.remarks].some((value) => String(value || "").toLowerCase().includes(q));
    return subjectMatch && studentMatch && targetMatch && weekMatch && searchMatch;
  }).sort((a, b) => String(a.studentName).localeCompare(String(b.studentName)) || String(a.date).localeCompare(String(b.date)));

  return <div className="dashboard-grid">
    <ActionModal title="Add Recitation" openEvent="jcoins:open-recitation-modal">
      <form onSubmit={(e) => { e.preventDefault(); run(() => post("/admin/recitations", form), form.studentIds.length > 1 ? `${form.studentIds.length} recitations added` : "Recitation added"); }}>
        <Select label="Subject" value={form.subjectId} onChange={(subjectId) => setForm({ ...form, subjectId, studentIds: form.studentIds.filter((id) => data.students.find((student) => student.id === id)?.subjectIds?.includes(subjectId)) })} options={data.subjects} />
        <StudentMultiPicker data={data} students={eligibleStudents} selected={form.studentIds} onChange={(studentIds) => setForm({ ...form, studentIds })} showSubjectFilter={false} />
        <Field label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        <Select label="Amount" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} options={amounts} />
        <Field label="Remarks" value={form.remarks} onChange={(v) => setForm({ ...form, remarks: v })} />
        <button disabled={!form.studentIds.length}>Add Recitation</button>
      </form>
    </ActionModal>
    <SubjectSectionPicker classes={classes} selectedKey={selectedClassKey} onSelect={setSelectedClassKey} title="Recitation Subject & Section" itemLabel="recitations" />
    {activeClass && <Panel title={`${activeClass.subjectName} - ${activeClass.sectionLabel} Participation`} wide defaultOpen>
      <div className="notice">Average participation/day uses {participation.classDayCount} recorded class day{participation.classDayCount === 1 ? "" : "s"} with recitation activity.</div>
      <div className="filter-bar">
        <Field label="Search Students" value={participationSearch} onChange={setParticipationSearch} />
        <div className="filter-count">{participationRows.length} student{participationRows.length === 1 ? "" : "s"}</div>
      </div>
      <Table columns={["Student", "Average / Day", "Active Days", "Participation Rate", "Total Recitations", "JCoins Earned"]} rows={participationRows.map((row) => [
        <button type="button" className="recitation-student-link" onClick={() => setSelectedStudentId(row.studentId)}>{row.studentName}</button>,
        row.averagePerDay.toFixed(2),
        `${row.activeDays}/${participation.classDayCount}`,
        `${row.participationRate.toFixed(1)}%`,
        row.totalRecitations,
        row.totalPoints
      ])} pageSize={25} />
    </Panel>}
    <Panel title="Recitation History" wide defaultOpen>
      <div className="filter-bar transaction-filter-bar">
        <Select label="Subject" value={filter.subjectId} onChange={(subjectId) => setFilter({ ...filter, subjectId })} options={[{ value: "all", label: "All subjects" }, ...data.subjects.map((subject) => ({ value: subject.id, label: subject.name }))]} />
        <Select label="Student" value={filter.studentId} onChange={(studentId) => setFilter({ ...filter, studentId })} options={[{ value: "all", label: "All students" }, ...data.students.map((student) => ({ value: student.id, label: student.name }))]} />
        <StudentFilterFields data={data} filter={filter} setFilter={setFilter} showSubject={false} showSearch={false} />
        <Select label="Week" value={filter.week} onChange={(week) => setFilter({ ...filter, week })} options={[{ value: "all", label: "All weeks" }, ...weekOptions]} />
        <Field label="Search Recitations" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
        <div className="filter-count">{filteredRecitations.length} recitation{filteredRecitations.length === 1 ? "" : "s"}</div>
        <button type="button" onClick={() => exportRecitations(filteredRecitations, filter)}>Export Spreadsheet</button>
      </div>
      <Table columns={["Date", "Student", "Subject", "Amount", "Remarks"]} rows={filteredRecitations.map((r) => [r.date, r.studentName, r.subjectName, r.amount, r.remarks])} />
    </Panel>
    {selectedProfile && <StudentParticipationModal profile={selectedProfile} onClose={() => setSelectedStudentId("")} />}
  </div>;
}

function recitationStudentsForClass(data, subjectId, section) {
  return (data.students || []).filter((student) =>
    (student.subjectIds || []).includes(subjectId)
    && String(student.section || "").trim() === String(section || "").trim()
  );
}

function recitationCountForClass(data, subjectId, section) {
  const studentIds = new Set(recitationStudentsForClass(data, subjectId, section).map((student) => student.id));
  return (data.recitations || []).filter((recitation) => recitation.subjectId === subjectId && studentIds.has(recitation.studentId)).length;
}

function buildClassParticipation(data, activeClass) {
  if (!activeClass) return { activeClass: null, students: [], recitations: [], dates: [], classDayCount: 0, rows: [] };
  const students = recitationStudentsForClass(data, activeClass.subjectId, activeClass.section);
  const studentIds = new Set(students.map((student) => student.id));
  const recitations = (data.recitations || []).filter((recitation) => recitation.subjectId === activeClass.subjectId && studentIds.has(recitation.studentId));
  const dates = [...new Set(recitations.map((recitation) => recitation.date).filter(Boolean))].sort();
  const classDayCount = dates.length;
  const rows = students.map((student) => {
    const records = recitations.filter((recitation) => recitation.studentId === student.id);
    const activeDays = new Set(records.map((recitation) => recitation.date).filter(Boolean)).size;
    const totalRecitations = records.length;
    const totalPoints = records.reduce((sum, recitation) => sum + Number(recitation.amount || 0), 0);
    return {
      studentId: student.id,
      studentName: student.name,
      totalRecitations,
      totalPoints,
      activeDays,
      averagePerDay: classDayCount ? totalRecitations / classDayCount : 0,
      averagePointsPerDay: classDayCount ? totalPoints / classDayCount : 0,
      participationRate: classDayCount ? activeDays / classDayCount * 100 : 0
    };
  }).sort((a, b) => a.studentName.localeCompare(b.studentName));
  return { activeClass, students, recitations, dates, classDayCount, rows };
}

function buildStudentParticipationProfile(participation, studentId) {
  const summary = participation.rows.find((row) => row.studentId === studentId);
  if (!summary) return null;
  const studentRecords = participation.recitations.filter((recitation) => recitation.studentId === studentId);
  const daily = participation.dates.map((date) => {
    const studentDay = studentRecords.filter((recitation) => recitation.date === date);
    const classDay = participation.recitations.filter((recitation) => recitation.date === date);
    return {
      date,
      participation: studentDay.length,
      classAverage: participation.students.length ? Math.round(classDay.length / participation.students.length * 100) / 100 : 0,
      points: studentDay.reduce((sum, recitation) => sum + Number(recitation.amount || 0), 0)
    };
  });
  return {
    ...summary,
    subjectName: participation.activeClass.subjectName,
    section: participation.activeClass.section,
    classDayCount: participation.classDayCount,
    daily,
    records: [...studentRecords].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  };
}

function StudentParticipationModal({ profile, onClose }) {
  const chartDays = profile.daily.slice(-30);
  return <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal-card recitation-profile-modal">
      <div className="section-head">
        <div>
          <div className="section-title">{profile.studentName}</div>
          <p className="muted-line">{profile.subjectName} | {profile.section}</p>
        </div>
        <button type="button" className="soft" onClick={onClose}>Close</button>
      </div>
      <div className="metric-strip recitation-profile-metrics">
        <section className="metric-tile"><span>Average / Day</span><strong>{profile.averagePerDay.toFixed(2)}</strong></section>
        <section className="metric-tile"><span>Participation Rate</span><strong>{profile.participationRate.toFixed(1)}%</strong></section>
        <section className="metric-tile"><span>Active Days</span><strong>{profile.activeDays}/{profile.classDayCount}</strong></section>
        <section className="metric-tile"><span>Total Recitations</span><strong>{profile.totalRecitations}</strong></section>
        <section className="metric-tile"><span>Average Points / Day</span><strong>{profile.averagePointsPerDay.toFixed(2)}</strong></section>
        <section className="metric-tile"><span>JCoins Earned</span><strong>{profile.totalPoints}</strong></section>
      </div>
      {chartDays.length ? <div className="recitation-chart-grid">
        <section className="recitation-chart-card">
          <h3>Daily Participation vs Class Average</h3>
          <p className="muted-line">Latest {chartDays.length} recorded class day{chartDays.length === 1 ? "" : "s"}.</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartDays}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.1)" />
              <XAxis dataKey="date" stroke="#a7b3c8" tickFormatter={shortDate} />
              <YAxis allowDecimals stroke="#a7b3c8" />
              <Tooltip contentStyle={recitationTooltipStyle} />
              <Legend />
              <Line type="monotone" dataKey="participation" name="Student" stroke="#22d3ee" strokeWidth={3} />
              <Line type="monotone" dataKey="classAverage" name="Class Average" stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </section>
        <section className="recitation-chart-card">
          <h3>Participation Points per Day</h3>
          <p className="muted-line">JCoins earned from recitation entries.</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartDays}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.1)" />
              <XAxis dataKey="date" stroke="#a7b3c8" tickFormatter={shortDate} />
              <YAxis allowDecimals={false} stroke="#a7b3c8" />
              <Tooltip contentStyle={recitationTooltipStyle} />
              <Bar dataKey="points" name="JCoins" fill="#facc15" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div> : <div className="attendance-empty">No recitation participation has been recorded for this student in the selected class.</div>}
      <section className="recitation-profile-history">
        <div className="section-title">Student Recitation History</div>
        <Table columns={["Date", "Participation Points", "Remarks"]} rows={profile.records.map((record) => [record.date, record.amount, record.remarks || "-"])} />
      </section>
    </section>
  </div>;
}

function shortDate(value) {
  const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const recitationTooltipStyle = {
  background: "#0f172a",
  border: "1px solid rgba(148,163,184,.3)",
  borderRadius: 10
};

function exportRecitations(recitations, filter) {
  const weekLabel = filter.week === "all" ? "all-weeks" : filter.week;
  const summary = new Map();
  recitations.forEach((recitation) => {
    const key = recitation.studentId;
    if (!summary.has(key)) summary.set(key, { studentName: recitation.studentName, subjects: new Set(), dates: new Set(), count: 0, earned: 0 });
    const row = summary.get(key);
    row.subjects.add(recitation.subjectName);
    row.dates.add(recitation.date);
    row.count += 1;
    row.earned += Number(recitation.amount || 0);
  });
  const rows = [...summary.values()]
    .sort((a, b) => String(a.studentName).localeCompare(String(b.studentName)))
    .map((row) => [
      row.studentName,
      [...row.subjects].sort().join(", "),
      row.count,
      [...row.dates].sort().join(", "),
      row.earned
    ]);
  exportSpreadsheet(`recitations-summary-${safeFilePart(weekLabel)}.xls`, ["Student", "Subject(s)", "Times Recited", "Dates Recited", "JCoins Earned"], rows, "Recitation Summary");
}

function buildRecitationWeeks(recitations) {
  const weeks = new Map();
  recitations.forEach((recitation) => {
    const key = weekKey(recitation.date);
    if (key && !weeks.has(key)) weeks.set(key, { value: key, label: weekDisplay(recitation.date) });
  });
  return [...weeks.values()].sort((a, b) => b.value.localeCompare(a.value));
}

function weekKey(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}

function weekDisplay(value) {
  const start = weekKey(value);
  if (!start) return "";
  const end = new Date(`${start}T00:00:00`);
  end.setDate(end.getDate() + 6);
  return `${start} to ${end.toISOString().slice(0, 10)}`;
}
