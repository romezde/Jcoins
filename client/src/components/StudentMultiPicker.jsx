import React, { useState } from "react";
import { Field, Select } from "./ui.jsx";

export function StudentMultiPicker({ data, students, selected, onChange, label = "Students", showSubjectFilter = true }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState({ search: "", subjectId: "all", section: "all", guildId: "all" });
  const ids = selected || [];
  const allStudents = data?.students || students;
  const visibleStudents = students.filter((student) => studentMatchesFilters(data, student, filter, { includeSubject: showSubjectFilter }));
  const selectedNames = allStudents.filter((student) => ids.includes(student.id)).map((student) => student.name);
  const summary = selectedNames.length ? selectedNames.length <= 2 ? selectedNames.join(", ") : `${selectedNames.length} students selected` : "No students selected";
  const toggle = (id) => onChange(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  const visibleIds = visibleStudents.map((student) => student.id);
  const selectVisible = () => onChange([...new Set([...ids, ...visibleIds])]);
  const unselectVisible = () => onChange(ids.filter((id) => !visibleIds.includes(id)));

  return <div className="dropdown-checklist">
    <label>{label}</label>
    <button type="button" className="soft dropdown-checklist-trigger" onClick={() => setOpen(true)}>
      <span>{summary}</span>
    </button>
    {open && <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card checklist-modal">
        <div className="section-head">
          <div className="section-title">Select Students</div>
          <button type="button" className="soft" onClick={() => setOpen(false)}>Close</button>
        </div>
        <div className="form-grid two">
          <StudentFilterFields data={data} filter={filter} setFilter={setFilter} showSubject={showSubjectFilter} searchLabel="Search Name" />
        </div>
        <div className="button-row">
          <button type="button" className="soft" onClick={selectVisible}>Check Visible</button>
          <button type="button" className="soft" onClick={unselectVisible}>Uncheck Visible</button>
          <button type="button" className="soft" onClick={() => onChange([])}>Clear All</button>
        </div>
        <p className="muted-line">{visibleStudents.length} visible student{visibleStudents.length === 1 ? "" : "s"}</p>
        <div className="dropdown-checklist-menu searchable-student-list">
          {visibleStudents.length ? visibleStudents.map((student) => <label key={student.id} className="check">
            <input type="checkbox" checked={ids.includes(student.id)} onChange={() => toggle(student.id)} />
            <span>{student.name}{student.section ? ` - ${student.section}` : ""}{studentGuildName(data, student.id) ? ` - ${studentGuildName(data, student.id)}` : ""}</span>
          </label>) : <p className="muted-line">No students found.</p>}
        </div>
      </section>
    </div>}
  </div>;
}

export function StudentFilterFields({ data, filter, setFilter, showSubject = true, showSearch = true, searchLabel = "Search Name" }) {
  return <>
    {showSearch && <Field label={searchLabel} value={filter.search || ""} onChange={(search) => setFilter({ ...filter, search })} />}
    {showSubject && <Select label="Subject" value={filter.subjectId || "all"} onChange={(subjectId) => setFilter({ ...filter, subjectId })} options={[{ value: "all", label: "All subjects" }, ...(data.subjects || []).map((subject) => ({ value: subject.id, label: subject.name }))]} />}
    <Select label="Section" value={filter.section || "all"} onChange={(section) => setFilter({ ...filter, section })} options={[{ value: "all", label: "All sections" }, { value: "__none", label: "No section" }, ...(data.sections || []).map((section) => ({ value: section, label: section }))]} />
    <Select label="Guild" value={filter.guildId || "all"} onChange={(guildId) => setFilter({ ...filter, guildId })} options={guildOptions(data)} />
  </>;
}

export function studentMatchesFilters(data, student, filter, options = {}) {
  if (!student) return filtersAreEmpty(filter, options);
  const includeSearch = options.includeSearch !== false;
  const includeSubject = options.includeSubject !== false;
  const q = String(filter.search || "").trim().toLowerCase();
  const subjectMatch = !includeSubject || !filter.subjectId || filter.subjectId === "all" || (student.subjectIds || []).includes(filter.subjectId);
  const sectionMatch = !filter.section || filter.section === "all" || (filter.section === "__none" ? !student.section : student.section === filter.section);
  const guildMatch = !filter.guildId || filter.guildId === "all" || studentGuildId(data, student.id) === filter.guildId;
  const searchMatch = !includeSearch || !q || [student.name, student.username, student.section, student.rank, studentGuildName(data, student.id)].some((value) => String(value || "").toLowerCase().includes(q));
  return subjectMatch && sectionMatch && guildMatch && searchMatch;
}

export function studentGuildId(data, studentId) {
  const row = (data.guildSystem?.students || []).find((student) => student.studentId === studentId);
  if (!row) return "";
  if (row.assignedGuildId) return row.assignedGuildId;
  const guild = (data.guildSystem?.guilds || []).find((item) => item.name === row.assignedGuild);
  return guild?.id || "";
}

function studentGuildName(data, studentId) {
  const guildId = studentGuildId(data, studentId);
  return (data.guildSystem?.guilds || []).find((guild) => guild.id === guildId)?.name || "";
}

function guildOptions(data) {
  return [
    { value: "all", label: "All guilds" },
    ...(data.guildSystem?.guilds || []).map((guild) => ({ value: guild.id, label: guild.name }))
  ];
}

function filtersAreEmpty(filter, options = {}) {
  const includeSubject = options.includeSubject !== false;
  return (!includeSubject || !filter.subjectId || filter.subjectId === "all")
    && (!filter.section || filter.section === "all")
    && (!filter.guildId || filter.guildId === "all");
}
