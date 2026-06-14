import React, { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { del, post, put } from "../api.js";
import { ActionModal, Field, Panel, Select, Table } from "../components/ui.jsx";
import { csvToObjects, downloadCsv } from "../utils/csv.js";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const reminderOptions = [0, 5, 10, 15, 30, 60].map((value) => ({ value, label: value ? `${value} min before` : "At start" }));
const scheduleTypes = ["Class", "Quiz", "Activity Deadline", "Event", "Reminder"];

export default function Schedule({ data, run, role }) {
  const canEdit = role === "admin" || role === "teacher";
  const sections = data.sections?.length ? data.sections : unique(data.students?.map((student) => student.section).filter(Boolean));
  const subjects = data.subjects || [];
  const [form, setForm] = useState(defaultForm(subjects, sections));
  const [filter, setFilter] = useState({ day: "all", section: "all", subjectId: "all" });
  const [importRows, setImportRows] = useState([]);
  const [importError, setImportError] = useState("");
  const [alarm, setAlarm] = useState(null);
  const filtered = filterSchedules(data.schedules || [], filter);
  const todaySchedules = todaySchedule(data.schedules || []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const due = nextDueSchedule(data.schedules || []);
      if (due && due.id !== alarm?.id) {
        playAlarmTone();
        setAlarm(due);
      }
    }, 30000);
    return () => window.clearInterval(timer);
  }, [data.schedules, alarm?.id]);

  async function readScheduleImport(file) {
    setImportError("");
    setImportRows([]);
    if (!file) return;
    try {
      const rows = csvToObjects(await file.text(), scheduleHeaderMap()).map(cleanImportRow).filter((row) => row.subject || row.subjectId);
      if (!rows.length) throw new Error("No schedule rows found.");
      setImportRows(rows);
    } catch (err) {
      setImportError(err.message);
    }
  }

  return <div className="dashboard-grid">
    {alarm && <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card schedule-alarm">
        <BellRing size={44} />
        <div className="section-title">Schedule Reminder</div>
        <strong>{alarm.subjectName}</strong>
        <p>{alarm.section} - {alarm.startTime} to {alarm.endTime}</p>
        {alarm.room && <p>{alarm.room}</p>}
        <button type="button" onClick={() => setAlarm(null)}>Dismiss</button>
      </section>
    </div>}
    <Panel title="Today" wide defaultOpen>
      <ScheduleCards schedules={todaySchedules} />
    </Panel>
    {canEdit && <div className="quick-actions wide">
      <ActionModal title="Add Schedule">
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => post("/admin/schedules", form), "Schedule added")) setForm(defaultForm(subjects, sections));
        }}>
          <ScheduleForm form={form} setForm={setForm} subjects={subjects} sections={sections} />
          <button disabled={!form.subjectId || !form.section}>Add Schedule</button>
        </form>
      </ActionModal>
      <ActionModal title="Import Schedule">
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => post("/admin/schedules/bulk", { schedules: importRows }), "Schedules imported")) setImportRows([]);
        }}>
          <p className="muted-line">Download the template, fill it in Excel or Google Sheets, save as CSV, then upload here.</p>
          <button type="button" className="soft" onClick={() => downloadScheduleTemplate(subjects, sections)}>Download Template</button>
          <label>Upload Filled CSV<input type="file" accept=".csv,text/csv" onChange={(e) => readScheduleImport(e.target.files?.[0])} /></label>
          {importError && <div className="error">{importError}</div>}
          {!!importRows.length && <Table columns={["Subject", "Section", "Day", "Start", "End", "Reminder"]} rows={importRows.slice(0, 20).map((row) => [row.subject || row.subjectId, row.section, row.day, row.startTime, row.endTime, row.reminderMinutes])} pageSize={5} />}
          <button disabled={!importRows.length}>Import Schedule</button>
        </form>
      </ActionModal>
    </div>}
    <Panel title="Weekly Calendar" wide defaultOpen>
      <div className="filter-bar">
        <Select label="Day" value={filter.day} onChange={(day) => setFilter({ ...filter, day })} options={[{ value: "all", label: "All days" }, ...days.map((day) => ({ value: day, label: day }))]} />
        <Select label="Section" value={filter.section} onChange={(section) => setFilter({ ...filter, section })} options={[{ value: "all", label: "All sections" }, ...sections.map((section) => ({ value: section, label: section }))]} />
        <Select label="Subject" value={filter.subjectId} onChange={(subjectId) => setFilter({ ...filter, subjectId })} options={[{ value: "all", label: "All subjects" }, ...subjects.map((subject) => ({ value: subject.id, label: subject.name }))]} />
        <div className="filter-count">{filtered.length} schedule{filtered.length === 1 ? "" : "s"}</div>
      </div>
      <div className="schedule-week">
        {days.map((day) => <section key={day} className="schedule-day">
          <h3>{day}</h3>
          <ScheduleCards schedules={filtered.filter((schedule) => schedule.day === day)} compact />
        </section>)}
      </div>
    </Panel>
    {canEdit && <Panel title="Manage Schedule" wide defaultOpen={false}>
      <ManageSchedule schedules={filtered} subjects={subjects} sections={sections} run={run} />
    </Panel>}
  </div>;
}

function ScheduleCards({ schedules, compact = false }) {
  if (!schedules.length) return <div className="empty-card">No schedule.</div>;
  return <div className={compact ? "schedule-card-list compact" : "schedule-card-list"}>
    {schedules.map((schedule) => <article key={schedule.id} className="schedule-card">
      <span>{schedule.type || "Class"}</span>
      <strong>{schedule.subjectName}</strong>
      <p>{schedule.section} - {schedule.startTime} to {schedule.endTime}</p>
      {schedule.room && <small>{schedule.room}</small>}
      {schedule.note && <small>{schedule.note}</small>}
      <em>{reminderLabel(schedule.reminderMinutes)}</em>
    </article>)}
  </div>;
}

function ScheduleForm({ form, setForm, subjects, sections }) {
  return <>
    <Select label="Subject" value={form.subjectId} onChange={(subjectId) => setForm({ ...form, subjectId })} options={subjects.map((subject) => ({ value: subject.id, label: subject.name }))} />
    <Select label="Section" value={form.section} onChange={(section) => setForm({ ...form, section })} options={sections.map((section) => ({ value: section, label: section }))} />
    <Select label="Day" value={form.day} onChange={(day) => setForm({ ...form, day })} options={days.map((day) => ({ value: day, label: day }))} />
    <Field label="Start Time" type="time" value={form.startTime} onChange={(startTime) => setForm({ ...form, startTime })} />
    <Field label="End Time" type="time" value={form.endTime} onChange={(endTime) => setForm({ ...form, endTime })} />
    <Select label="Reminder" value={form.reminderMinutes} onChange={(reminderMinutes) => setForm({ ...form, reminderMinutes: Number(reminderMinutes) })} options={reminderOptions} />
    <Select label="Type" value={form.type} onChange={(type) => setForm({ ...form, type })} options={scheduleTypes} />
    <Field label="Room / Link" value={form.room} onChange={(room) => setForm({ ...form, room })} />
    <Field label="Note" value={form.note} onChange={(note) => setForm({ ...form, note })} />
  </>;
}

function ManageSchedule({ schedules, subjects, sections, run }) {
  const [edits, setEdits] = useState({});
  return <Table columns={["Subject", "Section", "Day", "Time", "Reminder", "Actions"]} rows={schedules.map((schedule) => {
    const edit = edits[schedule.id] || schedule;
    return [
      <select value={edit.subjectId} onChange={(e) => setEdits({ ...edits, [schedule.id]: { ...edit, subjectId: e.target.value } })}>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>,
      <select value={edit.section} onChange={(e) => setEdits({ ...edits, [schedule.id]: { ...edit, section: e.target.value } })}>{sections.map((section) => <option key={section}>{section}</option>)}</select>,
      <select value={edit.day} onChange={(e) => setEdits({ ...edits, [schedule.id]: { ...edit, day: e.target.value } })}>{days.map((day) => <option key={day}>{day}</option>)}</select>,
      <div className="inline"><input type="time" value={edit.startTime} onChange={(e) => setEdits({ ...edits, [schedule.id]: { ...edit, startTime: e.target.value } })} /><input type="time" value={edit.endTime} onChange={(e) => setEdits({ ...edits, [schedule.id]: { ...edit, endTime: e.target.value } })} /></div>,
      <select value={edit.reminderMinutes} onChange={(e) => setEdits({ ...edits, [schedule.id]: { ...edit, reminderMinutes: Number(e.target.value) } })}>{reminderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>,
      <div className="inline"><button onClick={() => run(() => put(`/admin/schedules/${schedule.id}`, edit), "Schedule saved")}>Save</button><button className="danger" onClick={() => confirm("Delete this schedule?") && run(() => del(`/admin/schedules/${schedule.id}`), "Schedule deleted")}>Delete</button></div>
    ];
  })} />;
}

function defaultForm(subjects, sections) {
  return { subjectId: subjects[0]?.id || "", section: sections[0] || "", day: "Monday", startTime: "08:00", endTime: "09:00", reminderMinutes: 10, type: "Class", room: "", note: "" };
}

function filterSchedules(schedules, filter) {
  return schedules.filter((schedule) =>
    (filter.day === "all" || schedule.day === filter.day)
    && (filter.section === "all" || schedule.section === filter.section)
    && (filter.subjectId === "all" || schedule.subjectId === filter.subjectId)
  );
}

function todaySchedule(schedules) {
  const todayName = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date());
  return schedules.filter((schedule) => schedule.day === todayName).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
}

function nextDueSchedule(schedules) {
  const todayName = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date());
  const nowDate = new Date();
  const currentMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
  return schedules.find((schedule) => {
    if (schedule.day !== todayName) return false;
    const [hour, minute] = String(schedule.startTime || "00:00").split(":").map(Number);
    const reminderAt = hour * 60 + minute - Number(schedule.reminderMinutes || 0);
    return currentMinutes === reminderAt;
  });
}

function playAlarmTone() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.65);
    gain.connect(context.destination);
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime + index * 0.16);
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.16);
      oscillator.stop(context.currentTime + 0.42 + index * 0.16);
    });
    window.setTimeout(() => context.close(), 900);
  } catch {
    // Some mobile browsers block web audio until the user interacts with the page.
  }
}

function reminderLabel(value) {
  const minutes = Number(value || 0);
  return minutes ? `Reminder ${minutes} min before` : "Reminder at start";
}

function cleanImportRow(row) {
  return {
    subject: row.subject || row.subjectName || row.subjectname || "",
    subjectId: row.subjectId || row.subjectid || "",
    section: row.section || "",
    day: row.day || "",
    startTime: row.startTime || row.starttime || row.start || "",
    endTime: row.endTime || row.endtime || row.end || "",
    reminderMinutes: Number(row.reminderMinutes || row.reminderminutes || row.reminder || 10),
    type: row.type || "Class",
    room: row.room || "",
    note: row.note || row.notes || ""
  };
}

function scheduleHeaderMap() {
  return {
    subject: "subject",
    subjectname: "subject",
    subjectid: "subjectId",
    section: "section",
    day: "day",
    start: "startTime",
    starttime: "startTime",
    end: "endTime",
    endtime: "endTime",
    reminder: "reminderMinutes",
    reminderminutes: "reminderMinutes",
    type: "type",
    room: "room",
    note: "note",
    notes: "note"
  };
}

function downloadScheduleTemplate(subjects, sections) {
  const rows = [
    ["subject", "section", "day", "startTime", "endTime", "reminderMinutes", "type", "room", "note"],
    [subjects[0]?.name || "Math", sections[0] || "A", "Monday", "08:00", "09:00", "10", "Class", "Room 101", "Bring notebook"],
    [subjects[1]?.name || subjects[0]?.name || "Science", sections[0] || "A", "Wednesday", "10:00", "11:00", "5", "Quiz", "Room 101", "Short quiz"]
  ];
  downloadCsv("jcoins-schedule-template.csv", rows);
}

function unique(values) {
  return [...new Set(values || [])].filter(Boolean).sort();
}
