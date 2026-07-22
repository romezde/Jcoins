import React, { useState } from "react";
import { BookOpenCheck, Users } from "lucide-react";
import { Field } from "./ui.jsx";

export function buildSubjectSectionClasses(data, itemCount = () => 0) {
  const classPairs = new Map();
  const add = (subjectId, section = "") => {
    const cleanSubjectId = String(subjectId || "").trim();
    const cleanSection = String(section || "").trim();
    if (cleanSubjectId) classPairs.set(`${cleanSubjectId}::${cleanSection || "__none"}`, { subjectId: cleanSubjectId, section: cleanSection });
  };
  (data.students || []).forEach((student) => (student.subjectIds || []).forEach((subjectId) => add(subjectId, student.section)));
  ["activities", "quizzes", "attendanceWeeks", "writtenWorks", "majorExams", "gradeSettings", "gradeSummaries"].forEach((key) => {
    (data[key] || []).forEach((item) => add(item.subjectId, item.section));
  });
  return [...classPairs.values()].map(({ subjectId, section }) => {
    const subject = (data.subjects || []).find((item) => item.id === subjectId);
    const enrolledStudents = (data.students || []).filter((student) => (student.subjectIds || []).includes(subjectId) && String(student.section || "") === section);
    const sectionStudents = (data.students || []).filter((student) => String(student.section || "") === section);
    return subject ? {
      key: `${subject.id}::${section || "__none"}`,
      subjectId: subject.id,
      subjectName: subject.name,
      section,
      sectionLabel: section ? `Section ${section}` : "No section",
      studentCount: enrolledStudents.length || sectionStudents.length,
      itemCount: itemCount(subject.id, section)
    } : null;
  }).filter(Boolean).sort((a, b) => a.subjectName.localeCompare(b.subjectName, undefined, { numeric: true }) || a.sectionLabel.localeCompare(b.sectionLabel, undefined, { numeric: true }));
}

export default function SubjectSectionPicker({ classes, selectedKey, onSelect, title, itemLabel }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const visibleClasses = q ? classes.filter((item) => `${item.subjectName} ${item.sectionLabel}`.toLowerCase().includes(q)) : classes;
  return <section className="panel wide attendance-class-panel">
    <div className="section-head">
      <div className="section-title"><BookOpenCheck size={20} /> {title}</div>
      <span className="filter-count">{visibleClasses.length} class{visibleClasses.length === 1 ? "" : "es"}</span>
    </div>
    <div className="attendance-class-search">
      <Field label="Search Subject or Section" value={search} onChange={setSearch} />
    </div>
    <div className="attendance-class-grid">
      {visibleClasses.map((item) => <button type="button" key={item.key} className={`attendance-class-card${selectedKey === item.key ? " active" : ""}`} onClick={() => onSelect(item.key)}>
        <BookOpenCheck size={20} />
        <span><strong>{item.subjectName}</strong><small><Users size={14} /> {item.sectionLabel} · {item.studentCount} student{item.studentCount === 1 ? "" : "s"}</small></span>
        <b title={`${item.itemCount} ${itemLabel}`}>{item.itemCount}</b>
      </button>)}
    </div>
    {!visibleClasses.length && <div className="attendance-empty">No subject and section match your search.</div>}
  </section>;
}
