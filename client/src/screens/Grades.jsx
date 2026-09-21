import React, { useEffect, useMemo, useState } from "react";
import { Calculator, Pencil, RotateCcw } from "lucide-react";
import { del, post, put, today } from "../api.js";
import SubjectSectionPicker, { buildSubjectSectionClasses } from "../components/SubjectSectionPicker.jsx";
import { ActionModal, Field, Panel, Select, Table } from "../components/ui.jsx";
import { exportSpreadsheet, safeFilePart } from "../utils/exportSpreadsheet.js";

const gradeCategoryLabels = {
  writtenWorks: "Written Works",
  quizzes: "Quizzes",
  activities: "Activities / PT",
  attendance: "Attendance",
  majorExams: "Major Exams"
};

function attendanceGradeValue(status) {
  if (status === "check") return 100;
  if (status === "late" || status === "excused") return 50;
  return 0;
}

function recitationGradeBonus(data, studentId, subjectId) {
  const recitationPoints = (data.recitations || [])
    .filter((item) => item.studentId === studentId && item.subjectId === subjectId)
    .reduce((sum, item) => sum + Number(item.amount || 1), 0);
  const maximum = Number(data.settings?.grades?.recitationBonusMax || 0);
  return Math.min(maximum, recitationPoints / 100 * maximum);
}

function localGroupActivityPercent(activity, studentId) {
  const guild = (activity.guildRows || []).find((row) => (row.members || []).some((member) => member.studentId === studentId));
  if (!guild || guild.teacherScore == null) return null;
  const grade = guild.memberGrades?.[studentId];
  if (grade == null || grade === "") return null;
  const percent = Number(grade);
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null;
}

function activityDeadlinePassed(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
}

export default function Grades({ data, run }) {
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [search, setSearch] = useState("");
  const classes = useMemo(() => buildGradeClasses(data), [data.subjects, data.students, data.gradeSummaries]);
  const activeClass = classes.find((item) => item.key === selectedClassKey) || null;
  const classSummaries = activeClass ? gradeSummariesForClass(data, activeClass) : [];
  const summaries = classSummaries.filter((row) => {
    if (!activeClass || row.subjectId !== activeClass.subjectId || row.section !== activeClass.section) return false;
    const q = search.trim().toLowerCase();
    return !q || [row.studentName, row.rawGrade, row.currentGrade, row.finalGrade, row.riskStatus, row.priority, row.visibleAdvice, row.missingItems?.join(" ")].some((value) => String(value || "").toLowerCase().includes(q));
  });
  const writtenWorks = (data.writtenWorks || []).filter((work) => activeClass && work.subjectId === activeClass.subjectId && work.section === activeClass.section);
  const setting = activeClass ? gradeSettingForClass(data, activeClass) : null;

  return <div className="dashboard-grid">
    <GlobalGradeSetting data={data} run={run} />
    <WrittenWorkForm data={data} run={run} />
    <SubjectSectionPicker classes={classes} selectedKey={selectedClassKey} onSelect={setSelectedClassKey} title="Grade Classes" itemLabel="students" />
    {activeClass && <Panel title={`${activeClass.subjectName} - ${activeClass.sectionLabel}`} wide defaultOpen>
      <div className="filter-bar">
        <Field label="Search Students or Advice" value={search} onChange={setSearch} />
        <div className="filter-count">{summaries.length} student{summaries.length === 1 ? "" : "s"}</div>
      </div>
      <div className="notice">
        {setting?.releasedAt ? `Grades released to students on ${formatGradeDateTime(setting.releasedAt)}.` : "Initial grades are visible to teachers/admin only until you release this subject-section."}
      </div>
      <button type="button" className={setting?.releasedAt ? "soft" : ""} onClick={() => releaseGrades(activeClass, setting, run)}>
        {setting?.releasedAt ? "Release Updated Grades" : "Release Grades to Students"}
      </button>
      <GradeSettingsForm activeClass={activeClass} setting={setting} run={run} />
      {isGrade11Section(activeClass.section) && <GradeTransmutationControls data={data} activeClass={activeClass} summaries={classSummaries} run={run} />}
      <Table columns={["Student", ...(isGrade11Section(activeClass.section) ? ["Raw Grade", "Final Grade"] : ["Current"]), "Activities", "Attendance", "Quizzes", "Exams", "Risk", "Missing", "Actions"]} rows={summaries.map((row) => [
        row.studentName,
        ...(isGrade11Section(activeClass.section)
          ? [<strong className="grade-score">{formatCurrentGrade(row.rawGrade ?? row.currentGrade)}</strong>, <GradeFinalCell summary={row} />]
          : [<strong className={`grade-score ${riskClass(row.riskStatus)}`}>{formatCurrentGrade(row.currentGrade)}</strong>]),
        <ActivityGradeDetails summary={row} data={data} activeClass={activeClass} />,
        categoryPercent(row, "attendance"),
        categoryPercent(row, "quizzes"),
        categoryPercent(row, "majorExams"),
        <span className={`grade-risk ${riskClass(row.riskStatus)}`}>{row.riskStatus}</span>,
        row.missingItems?.length ? row.missingItems.slice(0, 4).join(", ") : "None",
        <div className="inline"><GradeAdviceModal summary={row} run={run} />{row.transmutation?.active && <button type="button" className="soft" onClick={() => returnStudentToRaw(row, activeClass, run)}><RotateCcw size={15} /> Raw</button>}</div>
      ])} pageSize={25} />
      <button type="button" className="soft" onClick={() => exportGrades(activeClass, summaries)}>Export Grade Summary</button>
    </Panel>}
    {activeClass && <Panel title="Written Works" wide defaultOpen={false} actions={<WrittenWorkForm data={data} run={run} presetClass={activeClass} buttonLabel="Add Written Work for This Class" />}>
      <Table columns={["Written Work", "Date", "Max Score", "Recorded", "Remarks", "Action"]} rows={writtenWorks.map((work) => [
        work.title,
        work.date,
        work.maxScore,
        work.tracker,
        work.remarks,
        <div className="inline"><WrittenWorkForm data={data} run={run} work={work} /><button type="button" className="soft" onClick={() => exportWrittenWork(work)}>Export</button><button type="button" className="danger" onClick={() => deleteWrittenWork(work, run)}>Delete</button></div>
      ])} />
    </Panel>}
    {activeClass && writtenWorks.map((work) => <WrittenWorkCard key={work.id} work={work} run={run} />)}
    {!activeClass && <section className="panel wide attendance-empty">Choose a subject and section above to view grades.</section>}
  </div>;
}

function buildGradeClasses(data) {
  const classes = new Map();
  const add = (subjectId, section = "", studentCount = 0) => {
    const cleanSubjectId = String(subjectId || "").trim();
    const cleanSection = String(section || "").trim();
    const subject = (data.subjects || []).find((item) => item.id === cleanSubjectId);
    if (!subject || !cleanSection) return;
    const key = `${cleanSubjectId}::${cleanSection || "__none"}`;
    const existing = classes.get(key);
    const summaryCount = (data.gradeSummaries || []).filter((row) => row.subjectId === cleanSubjectId && String(row.section || "").trim() === cleanSection).length;
    classes.set(key, {
      key,
      subjectId: cleanSubjectId,
      subjectName: subject.name,
      section: cleanSection,
      sectionLabel: cleanSection ? `Section ${cleanSection}` : "No section",
      studentCount: Math.max(existing?.studentCount || 0, studentCount),
      itemCount: Math.max(summaryCount, studentCount)
    });
  };
  const summaryGroups = new Map();
  (data.gradeSummaries || []).forEach((row) => {
    const key = `${row.subjectId}::${String(row.section || "").trim() || "__none"}`;
    summaryGroups.set(key, { subjectId: row.subjectId, section: String(row.section || "").trim(), count: (summaryGroups.get(key)?.count || 0) + 1 });
  });
  summaryGroups.forEach((item) => add(item.subjectId, item.section, item.count));
  buildSubjectSectionClasses(data, () => 0).forEach((item) => add(item.subjectId, item.section, item.studentCount));
  return [...classes.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName, undefined, { numeric: true }) || a.sectionLabel.localeCompare(b.sectionLabel, undefined, { numeric: true }));
}

function gradeSummariesForClass(data, activeClass) {
  const rows = (data.gradeSummaries || []).filter((row) => row.subjectId === activeClass.subjectId && String(row.section || "").trim() === activeClass.section);
  return rows.length ? rows : computeLocalGradeSummaries(data, activeClass);
}

function computeLocalGradeSummaries(data, activeClass) {
  const setting = gradeSettingForClass(data, activeClass);
  const weights = setting.weights || {};
  const students = (data.students || []).filter((student) => String(student.section || "").trim() === activeClass.section);
  const writtenWorks = (data.writtenWorks || []).filter((work) => work.subjectId === activeClass.subjectId && String(work.section || "").trim() === activeClass.section);
  const quizzes = (data.quizzes || []).filter((quiz) => quiz.subjectId === activeClass.subjectId && String(quiz.section || "").trim() === activeClass.section && quizCountsInGrades(quiz));
  const activities = (data.activities || []).filter((activity) => activity.subjectId === activeClass.subjectId && (!String(activity.section || "").trim() || String(activity.section || "").trim() === activeClass.section));
  const groupActivities = (data.groupActivities || []).filter((activity) => activity.subjectId === activeClass.subjectId && String(activity.section || "").trim() === activeClass.section);
  const attendanceWeeks = (data.attendanceWeeks || []).filter((week) => week.subjectId === activeClass.subjectId && (!String(week.section || "").trim() || String(week.section || "").trim() === activeClass.section));
  const majorExams = (data.majorExams || []).filter((exam) => exam.subjectId === activeClass.subjectId && String(exam.section || "").trim() === activeClass.section);
  return students.map((student) => localGradeSummaryForStudent(data, activeClass, setting, { writtenWorks, quizzes, activities, groupActivities, attendanceWeeks, majorExams }, student));
}

function quizCountsInGrades(quiz) {
  return quiz.status !== "draft"
    || Number(quiz.submittedCount || 0) > 0
    || (quiz.rows || []).some((row) => Number(row.attempts || 0) > 0)
    || (quiz.submissions || []).some((submission) => (submission.attempts || []).length > 0);
}

function localGradeSummaryForStudent(data, activeClass, setting, records, student) {
  const weights = setting.weights || {};
  const missingItems = [];
  const writtenPercents = [];
  if (setting.includeWrittenWorks !== false) records.writtenWorks.forEach((work) => {
    const row = (work.rows || []).find((item) => item.studentId === student.id);
    if (row?.recorded) writtenPercents.push(Number(row.percent || 0));
    else {
      writtenPercents.push(0);
      missingItems.push(work.title);
    }
  });
  const quizPercents = [];
  records.quizzes.forEach((quiz) => {
    const row = (quiz.rows || []).find((item) => item.studentId === student.id);
    const total = quizQuestionTotal(quiz, row);
    if (row?.attempts && total) quizPercents.push(Number(row.bestScore || 0) / total * 100);
    else {
      quizPercents.push(0);
      missingItems.push(quiz.title);
    }
  });
  const activityPercents = [];
  records.activities.forEach((activity) => {
    const row = (activity.rows || []).find((item) => item.studentId === student.id);
    if (!activityDeadlinePassed(row?.effectiveDeadline || activity.deadline) && !row?.manuallyGraded) return;
    if (row?.awaitingGrade) return;
    if (row?.submitted && row.score !== "" && row.score != null) activityPercents.push(Number(row.score || 0));
    else {
      activityPercents.push(0);
      missingItems.push(activity.title);
    }
  });
  (records.groupActivities || []).forEach((activity) => {
    const percent = localGroupActivityPercent(activity, student.id);
    if (!activityDeadlinePassed(activity.deadline) && percent == null) return;
    if (percent != null) activityPercents.push(percent);
    else {
      activityPercents.push(0);
      missingItems.push(activity.title);
    }
  });
  const attendanceValues = [];
  records.attendanceWeeks.forEach((week) => {
    const cancelled = new Set(week.cancelledDates || []);
    (week.dates || []).filter((date) => !cancelled.has(date)).forEach((date) => {
      const record = (data.attendanceRecords || []).find((item) => item.weekId === week.id && item.studentId === student.id && item.date === date);
      attendanceValues.push(attendanceGradeValue(record?.status));
    });
  });
  const majorPercents = [];
  records.majorExams.forEach((exam) => {
    const row = (exam.rows || []).find((item) => item.studentId === student.id);
    if (row?.recorded) majorPercents.push(Number(row.percent || 0));
    else {
      majorPercents.push(0);
      missingItems.push(exam.title);
    }
  });
  if (!records.majorExams.length) majorPercents.push(100);
  const hasCountedActivities = activityPercents.length > 0;
  const categories = {
    writtenWorks: localCategory("Written Works", setting.includeWrittenWorks === false ? 0 : weights.writtenWorks, writtenPercents, setting.includeWrittenWorks !== false && records.writtenWorks.length),
    quizzes: localCategory("Quizzes", weights.quizzes, quizPercents, records.quizzes.length),
    activities: localCategory("Activities / PT", weights.activities, activityPercents, hasCountedActivities),
    attendance: localCategory("Attendance", weights.attendance, attendanceValues, attendanceValues.length),
    majorExams: localCategory("Major Exams", weights.majorExams, majorPercents, true)
  };
  const activeWeight = Object.values(categories).reduce((sum, category) => sum + Number(category.weight || 0), 0);
  const weightedPercent = activeWeight ? Object.values(categories).reduce((sum, category) => sum + Number(category.contribution || 0), 0) / activeWeight * 100 : 100;
  const recitationBonus = recitationGradeBonus(data, student.id, activeClass.subjectId);
  const rawGrade = Math.max(0, Math.min(100, Math.round((weightedPercent + recitationBonus) * 100) / 100));
  const currentGrade = rawGrade;
  const riskStatus = gradeRiskLabel(currentGrade, setting.passingGrade);
  return {
    studentId: student.id,
    studentName: student.name,
    subjectId: activeClass.subjectId,
    subjectName: activeClass.subjectName,
    section: activeClass.section,
    rawGrade,
    currentGrade,
    finalGrade: null,
    transmutation: null,
    passingGrade: setting.passingGrade,
    riskStatus,
    priority: ["At Risk", "Critical"].includes(riskStatus) ? "Urgent" : riskStatus === "Watch" ? "Medium" : "Low",
    recitationBonus,
    categories,
    missingItems: [...new Set(missingItems)].slice(0, 20),
    visibleAdvice: "Local grade preview from loaded attendance, activities, quizzes, and exams.",
    visibleToStudent: true
  };
}

function localCategory(label, weight, values, active) {
  const categoryWeight = active ? Number(weight || 0) : 0;
  const percent = active && values.length ? Math.round(values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length) : null;
  return { label, weight: categoryWeight, configuredWeight: Number(weight || 0), percent, contribution: percent == null ? 0 : Math.round(percent * categoryWeight) / 100, active };
}

function quizQuestionTotal(quiz, row) {
  const latestTotal = String(row?.latestScore || "").match(/\/(\d+)/)?.[1];
  return Number(latestTotal || quiz.questions?.length || quiz.itemCount || 0);
}

function gradeRiskLabel(grade, passingGrade = 75) {
  if (grade >= 96) return "Outstanding";
  if (grade >= Math.max(85, Number(passingGrade || 75) + 10)) return "Safe";
  if (grade >= Number(passingGrade || 75)) return "Watch";
  if (grade >= Math.max(0, Number(passingGrade || 75) - 15)) return "At Risk";
  return "Critical";
}

function GradeSettingsForm({ activeClass, setting, run }) {
  const [form, setForm] = useState(() => settingsFormValues(setting));
  useEffect(() => setForm(settingsFormValues(setting)), [setting?.id, JSON.stringify(setting?.weights || {}), setting?.passingGrade, setting?.includeWrittenWorks]);
  const total = Object.values(form.weights || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const setWeight = (key, value) => setForm({ ...form, weights: { ...form.weights, [key]: value } });
  function submit(event) {
    event.preventDefault();
    run(() => put("/admin/grades/settings", { ...form, subjectId: activeClass.subjectId, section: activeClass.section }), "Grade settings saved");
  }
  return <form className="grade-settings-form" onSubmit={submit}>
    <div className="form-grid two">
      {Object.entries(gradeCategoryLabels).map(([key, label]) => <Field key={key} label={`${label} Weight`} type="number" min="0" max="100" value={form.weights[key]} onChange={(value) => setWeight(key, value)} />)}
      <Field label="Passing Grade" type="number" min="1" max="100" value={form.passingGrade} onChange={(passingGrade) => setForm({ ...form, passingGrade })} />
    </div>
    <label className="check"><input type="checkbox" checked={form.includeWrittenWorks} onChange={(event) => setForm({ ...form, includeWrittenWorks: event.target.checked })} /> Include written works</label>
    <div className={total === 100 ? "notice" : "error"}>Weight total: {total}%{total === 100 ? "" : " (best if this is 100%)"}</div>
    <button>Save Grade Settings</button>
  </form>;
}

function GlobalGradeSetting({ data, run }) {
  const savedValue = data.settings?.grades?.recitationBonusMax ?? 5;
  const savedTransmutation = transmutationSettings(data);
  const [form, setForm] = useState({ recitationBonusMax: savedValue, transmutation: savedTransmutation });
  useEffect(() => setForm({ recitationBonusMax: savedValue, transmutation: savedTransmutation }), [savedValue, JSON.stringify(savedTransmutation)]);
  const canEdit = data.user?.role === "admin";
  function submit(event) {
    event.preventDefault();
    run(() => put("/admin/grades/global-settings", form), "Global grade settings saved");
  }
  return <Panel title="Global Grade Setting" wide defaultOpen>
    <p className="muted-line">The recitation bonus applies to every class. Grade transmutation applies only to Grade 11 and never changes the saved raw grade.</p>
    {canEdit
      ? <form className="grade-settings-form" onSubmit={submit}>
        <div className="form-grid two">
          <Field label="Recitation Bonus Max (All Subjects)" type="number" min="0" max="20" step="0.01" value={form.recitationBonusMax} onChange={(recitationBonusMax) => setForm({ ...form, recitationBonusMax })} />
          <Field label="Required Raw Grade" type="number" min="0" max="99" step="0.01" value={form.transmutation.requiredRawGrade} onChange={(requiredRawGrade) => setForm({ ...form, transmutation: { ...form.transmutation, requiredRawGrade } })} />
          <Field label="Equivalent Final Grade" type="number" min="0" max="100" step="0.01" value={form.transmutation.equivalentFinalGrade} onChange={(equivalentFinalGrade) => setForm({ ...form, transmutation: { ...form.transmutation, equivalentFinalGrade } })} />
          <Field label="Maximum Final Grade" type="number" min="1" max="100" step="0.01" value={form.transmutation.maximumFinalGrade} onChange={(maximumFinalGrade) => setForm({ ...form, transmutation: { ...form.transmutation, maximumFinalGrade } })} />
          <Select label="Rounding" value={form.transmutation.rounding} onChange={(rounding) => setForm({ ...form, transmutation: { ...form.transmutation, rounding } })} options={[
            { value: "nearest", label: "Nearest whole number" },
            { value: "up", label: "Always round up" },
            { value: "two_decimals", label: "Keep two decimals" }
          ]} />
        </div>
        <div className="notice">Example: raw {form.transmutation.requiredRawGrade || 0} becomes {form.transmutation.equivalentFinalGrade || 0}, while raw 100 becomes {form.transmutation.maximumFinalGrade || 100}.</div>
        <button>Save Global Grade Settings</button>
      </form>
      : <div className="notice">Recitation maximum: {Number(savedValue || 0).toFixed(2)}. Grade 11 transmutation: raw {savedTransmutation.requiredRawGrade} becomes {savedTransmutation.equivalentFinalGrade}, up to {savedTransmutation.maximumFinalGrade}. Only an admin can change this formula.</div>}
  </Panel>;
}

function GradeTransmutationControls({ data, activeClass, summaries, run }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const settings = transmutationSettings(data);
  const preview = summaries.map((summary) => {
    const rawGrade = Number(summary.rawGrade ?? summary.currentGrade ?? 0);
    return { ...summary, rawGrade, previewFinalGrade: calculateTransmutedGrade(rawGrade, settings) };
  });
  const eligibleCount = preview.filter((row) => row.previewFinalGrade != null).length;
  const activeCount = summaries.filter((row) => row.transmutation?.active).length;

  async function applyTransmutation() {
    if (busy || !eligibleCount) return;
    setBusy(true);
    const result = await run(() => post("/admin/grades/transmute", {
      subjectId: activeClass.subjectId,
      section: activeClass.section
    }), `${eligibleCount} grade${eligibleCount === 1 ? "" : "s"} transmuted`);
    setBusy(false);
    if (result) setOpen(false);
  }

  async function returnAllToRaw() {
    if (busy || !activeCount || !confirm(`Return all ${activeCount} transmuted grades in ${activeClass.subjectName} - ${activeClass.sectionLabel} to their raw grades?`)) return;
    setBusy(true);
    await run(() => post("/admin/grades/return-to-raw", {
      subjectId: activeClass.subjectId,
      section: activeClass.section
    }), "Grades returned to raw");
    setBusy(false);
  }

  return <section className="grade-transmutation-bar">
    <div>
      <strong>Grade 11 Transmutation</strong>
      <p>Raw {settings.requiredRawGrade} becomes {settings.equivalentFinalGrade}. Raw grades below {settings.requiredRawGrade} remain unchanged.</p>
    </div>
    <div className="inline">
      <button type="button" disabled={busy || !summaries.length} onClick={() => setOpen(true)}><Calculator size={16} /> Preview Transmutation</button>
      {activeCount > 0 && <button type="button" className="soft" disabled={busy} onClick={returnAllToRaw}><RotateCcw size={16} /> Return All to Raw</button>}
    </div>
    {open && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Grade transmutation preview">
      <section className="modal-card modal-card-wide grade-transmutation-modal">
        <div className="section-head">
          <div>
            <div className="section-title">Transmutation Preview</div>
            <p className="muted-line">{activeClass.subjectName} - {activeClass.sectionLabel}</p>
          </div>
          <button type="button" className="soft" disabled={busy} onClick={() => setOpen(false)}>Close</button>
        </div>
        <div className="account-grid grade-transmutation-summary">
          <div className="account-item"><span>Eligible</span><strong>{eligibleCount}</strong></div>
          <div className="account-item"><span>Not Eligible</span><strong>{preview.length - eligibleCount}</strong></div>
          <div className="account-item"><span>Rule</span><strong>{settings.requiredRawGrade} to {settings.equivalentFinalGrade}</strong></div>
        </div>
        <Table columns={["Student", "Raw Grade", "Preview Final", "Status"]} rows={preview.map((row) => [
          row.studentName,
          formatCurrentGrade(row.rawGrade),
          row.previewFinalGrade == null ? "-" : formatCurrentGrade(row.previewFinalGrade),
          row.previewFinalGrade == null
            ? <span className="grade-ineligible">Not Eligible</span>
            : <span className="grade-eligible">Ready</span>
        ])} pageSize={20} />
        {preview.some((row) => row.previewFinalGrade == null) && <div className="error">Cannot transmute grade. The raw grade did not reach the required minimum of {settings.requiredRawGrade}. Those students will remain on their raw grade; eligible students can still be transmuted.</div>}
        <button type="button" disabled={busy || !eligibleCount} onClick={applyTransmutation}>{busy ? "Saving..." : `Confirm Transmutation for ${eligibleCount} Student${eligibleCount === 1 ? "" : "s"}`}</button>
      </section>
    </div>}
  </section>;
}

function GradeFinalCell({ summary }) {
  if (!summary.transmutation?.active) return <span className="muted-line">Not transmuted</span>;
  return <div className="grade-final-cell">
    <strong className={`grade-score ${riskClass(summary.riskStatus)}`}>{formatCurrentGrade(summary.finalGrade ?? summary.currentGrade)}</strong>
    <span>Transmuted{summary.transmutation.rawGradeChanged ? " · raw changed" : ""}</span>
  </div>;
}

function WrittenWorkForm({ data, run, work = null, presetClass = null, buttonLabel = null }) {
  const [form, setForm] = useState(() => work ? writtenWorkFormValues(work) : newWrittenWorkForm(data, presetClass));
  const hasScores = !!work?.rows?.some((row) => row.recorded);
  useEffect(() => {
    if (work) setForm(writtenWorkFormValues(work));
    else setForm(newWrittenWorkForm(data, presetClass));
  }, [work?.id, work?.updatedAt, presetClass?.key]);
  function submit(event) {
    event.preventDefault();
    run(() => work ? put(`/admin/written-works/${work.id}`, form) : post("/admin/written-works", form), work ? "Written work updated" : "Written work added");
  }
  return <ActionModal title={work ? `Edit ${work.title}` : "Add Written Work"} buttonLabel={buttonLabel || (work ? "Edit" : "Add Written Work")} icon={work ? Pencil : undefined}>
    <form onSubmit={submit}>
      <Field label="Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
      <Select label="Subject" value={form.subjectId} onChange={(subjectId) => setForm({ ...form, subjectId })} options={hasScores ? data.subjects.filter((subject) => subject.id === form.subjectId) : data.subjects} />
      <Select label="Section" value={form.section} onChange={(section) => setForm({ ...form, section })} options={hasScores ? [{ value: form.section, label: form.section }] : (data.sections || []).map((section) => ({ value: section, label: section }))} />
      {hasScores && <p className="muted-line">Subject and section are locked after scores are recorded.</p>}
      <Field label="Date" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} />
      <Field label="Maximum Score" type="number" min="1" max="1000" step="0.01" value={form.maxScore} onChange={(maxScore) => setForm({ ...form, maxScore })} />
      <Field label="Remarks" value={form.remarks} onChange={(remarks) => setForm({ ...form, remarks })} />
      <button>{work ? "Save Written Work" : "Add Written Work"}</button>
    </form>
  </ActionModal>;
}

function WrittenWorkCard({ work, run }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const rows = (work.rows || []).filter((row) => !q || [row.studentName, row.score, row.percent].some((value) => String(value || "").toLowerCase().includes(q)));
  return <Panel title={`${work.title} Scores`} wide defaultOpen={false} actions={<div className="inline"><strong>{work.tracker} recorded</strong><button type="button" className="soft" onClick={() => exportWrittenWork(work)}>Export Scores</button></div>}>
    <p className="muted-line">{work.subjectName} | {work.section} | {work.date} | maximum score {work.maxScore}</p>
    <div className="filter-bar">
      <Field label="Search Students" value={search} onChange={setSearch} />
      <div className="filter-count">{rows.length} student{rows.length === 1 ? "" : "s"}</div>
    </div>
    <Table columns={["Student", "Score", "Percent"]} rows={rows.map((row) => [
      row.studentName,
      <WrittenWorkScoreInput work={work} row={row} run={run} />,
      row.percent === "" ? "-" : `${row.percent}%`
    ])} pageSize={30} />
  </Panel>;
}

function WrittenWorkScoreInput({ work, row, run }) {
  const [score, setScore] = useState(row.score ?? "");
  useEffect(() => setScore(row.score ?? ""), [row.score, work.id]);
  const changed = String(score ?? "") !== String(row.score ?? "");
  return <div className="major-exam-score-cell">
    <input className="score-input" type="number" min="0" max={work.maxScore} step="0.01" value={score} onChange={(event) => setScore(event.target.value)} />
    <button type="button" className="soft" disabled={!changed} onClick={() => run(() => put(`/admin/written-works/${work.id}/scores`, { studentId: row.studentId, score }), "Written work score saved")}>Save</button>
  </div>;
}

function GradeAdviceModal({ summary, run }) {
  const [form, setForm] = useState(() => adviceFormValues(summary));
  useEffect(() => setForm(adviceFormValues(summary)), [summary.studentId, summary.subjectId, summary.section, summary.lastAdvisedAt]);
  function submit(event) {
    event.preventDefault();
    run(() => put("/admin/grades/notes", {
      studentId: summary.studentId,
      subjectId: summary.subjectId,
      section: summary.section,
      ...form,
      missingItems: splitMissingItems(form.missingItems)
    }), "Advice saved");
  }
  return <ActionModal title={`Advice for ${summary.studentName}`} buttonLabel="Advice" icon={Pencil}>
    <form onSubmit={submit}>
      <div className="account-grid">
        <div className="account-item"><span>Current Grade</span><strong>{formatCurrentGrade(summary.currentGrade)}</strong></div>
        <div className="account-item"><span>Class</span><strong>{summary.subjectName} - {summary.section}</strong></div>
      </div>
      <Select label="Risk Status" value={form.riskStatus} onChange={(riskStatus) => setForm({ ...form, riskStatus })} options={["", "Outstanding", "Safe", "Watch", "At Risk", "Critical"].map((value) => ({ value, label: value || "Auto" }))} />
      <Select label="Priority" value={form.priority} onChange={(priority) => setForm({ ...form, priority })} options={["Low", "Medium", "Urgent"]} />
      <label>Student Advice<textarea value={form.visibleAdvice} onChange={(event) => setForm({ ...form, visibleAdvice: event.target.value })} /></label>
      <label>Private Teacher Note<textarea value={form.privateNote} onChange={(event) => setForm({ ...form, privateNote: event.target.value })} /></label>
      <Field label="Missing / Lacking Items" value={form.missingItems} onChange={(missingItems) => setForm({ ...form, missingItems })} />
      <label className="check"><input type="checkbox" checked={form.visibleToStudent} onChange={(event) => setForm({ ...form, visibleToStudent: event.target.checked })} /> Show advice to student</label>
      <button>Save Advice</button>
    </form>
  </ActionModal>;
}

function gradeSettingForClass(data, activeClass) {
  return (data.gradeSettings || []).find((setting) => setting.subjectId === activeClass.subjectId && setting.section === activeClass.section) || {
    id: `${activeClass.subjectId}::${activeClass.section}`,
    weights: data.settings?.grades?.weights || { writtenWorks: 20, quizzes: 20, activities: 30, attendance: 10, majorExams: 20 },
    includeWrittenWorks: data.settings?.grades?.includeWrittenWorks !== false,
    passingGrade: data.settings?.grades?.passingGrade ?? 75
  };
}

function settingsFormValues(setting = {}) {
  return {
    weights: {
      writtenWorks: setting.weights?.writtenWorks ?? 20,
      quizzes: setting.weights?.quizzes ?? 20,
      activities: setting.weights?.activities ?? 30,
      attendance: setting.weights?.attendance ?? 10,
      majorExams: setting.weights?.majorExams ?? 20
    },
    includeWrittenWorks: setting.includeWrittenWorks !== false,
    passingGrade: setting.passingGrade ?? 75
  };
}

function releaseGrades(activeClass, setting, run) {
  const action = setting?.releasedAt ? "release updated grades again" : "release grades to students";
  return confirm(`This will ${action} for ${activeClass.subjectName} - ${activeClass.sectionLabel}.`)
    && run(() => post("/admin/grades/release", { subjectId: activeClass.subjectId, section: activeClass.section }), "Grades released");
}

function formatGradeDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || "") : date.toLocaleString();
}

function writtenWorkFormValues(work) {
  return {
    title: work.title,
    subjectId: work.subjectId,
    section: work.section || "",
    date: work.date || today(),
    maxScore: work.maxScore ?? 100,
    remarks: work.remarks || ""
  };
}

function newWrittenWorkForm(data, presetClass = null) {
  return {
    title: "Written Work",
    subjectId: presetClass?.subjectId || data.subjects?.[0]?.id || "",
    section: presetClass?.section || data.sections?.[0] || "",
    date: today(),
    maxScore: 100,
    remarks: ""
  };
}

function adviceFormValues(summary) {
  return {
    riskStatus: summary.riskStatus || "",
    priority: summary.priority || "Medium",
    visibleAdvice: summary.visibleAdvice || "",
    privateNote: summary.privateNote || "",
    visibleToStudent: summary.visibleToStudent !== false,
    missingItems: (summary.missingItems || []).join(", ")
  };
}

function splitMissingItems(value) {
  return String(value || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}

function transmutationSettings(data) {
  const settings = data.settings?.grades?.transmutation || {};
  return {
    requiredRawGrade: Number(settings.requiredRawGrade ?? 60),
    equivalentFinalGrade: Number(settings.equivalentFinalGrade ?? 75),
    maximumFinalGrade: Number(settings.maximumFinalGrade ?? 100),
    rounding: ["nearest", "up", "two_decimals"].includes(settings.rounding) ? settings.rounding : "nearest"
  };
}

function calculateTransmutedGrade(rawGrade, settings) {
  const raw = Math.max(0, Math.min(100, Number(rawGrade || 0)));
  if (raw < settings.requiredRawGrade) return null;
  const ratio = (raw - settings.requiredRawGrade) / (100 - settings.requiredRawGrade);
  const value = settings.equivalentFinalGrade + ratio * (settings.maximumFinalGrade - settings.equivalentFinalGrade);
  if (settings.rounding === "up") return Math.min(settings.maximumFinalGrade, Math.ceil(value));
  if (settings.rounding === "two_decimals") return Math.min(settings.maximumFinalGrade, Math.round(value * 100) / 100);
  return Math.min(settings.maximumFinalGrade, Math.round(value));
}

function isGrade11Section(section = "") {
  const value = String(section || "").trim().toLowerCase();
  return /(?:^|\b)(?:grade|g)\s*[- ]?\s*11(?:\b|\s)|\b11(?:th)?\s*(?:grade|year)\b/.test(value);
}

function returnStudentToRaw(summary, activeClass, run) {
  return confirm(`Return ${summary.studentName}'s final grade to the current raw grade of ${formatCurrentGrade(summary.rawGrade ?? summary.currentGrade)}?`)
    && run(() => post("/admin/grades/return-to-raw", {
      subjectId: activeClass.subjectId,
      section: activeClass.section,
      studentIds: [summary.studentId]
    }), `${summary.studentName}'s grade returned to raw`);
}

function riskClass(status = "") {
  return `risk-${status.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "watch"}`;
}

function categoryPercent(row, key) {
  const value = row.categories?.[key]?.percent;
  return value == null ? "-" : `${Math.round(Number(value || 0))}%`;
}

function ActivityGradeDetails({ summary, data, activeClass }) {
  const [open, setOpen] = useState(false);
  const details = activityDetailsForStudent(data, activeClass, summary.studentId);
  return <>
    <button type="button" className="soft grade-category-button" onClick={() => setOpen(true)} title={`View ${summary.studentName}'s activities`}>
      {categoryPercent(summary, "activities")}
    </button>
    {open && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${summary.studentName} activity grades`}>
      <section className="modal-card modal-card-wide grade-activity-modal">
        <div className="section-head">
          <div>
            <div className="section-title">{summary.studentName}</div>
            <p className="muted-line">{activeClass.subjectName} - {activeClass.sectionLabel} · Activities {categoryPercent(summary, "activities")}</p>
          </div>
          <button type="button" className="soft" onClick={() => setOpen(false)}>Close</button>
        </div>
        <Table columns={["Activity", "Type", "Status", "Submitted", "Days Late", "Score", "Deadline"]} rows={details.map((item) => [
          item.title,
          item.type,
          item.status,
          item.submittedAt,
          item.daysLate,
          item.score,
          item.deadline
        ])} pageSize={10} />
        {!details.length && <div className="attendance-empty">No activities are recorded for this subject and section.</div>}
      </section>
    </div>}
  </>;
}

function activityDetailsForStudent(data, activeClass, studentId) {
  const details = [];
  (data.activities || []).filter((activity) => (
    activity.subjectId === activeClass.subjectId
      && (!String(activity.section || "").trim() || String(activity.section || "").trim() === activeClass.section)
  )).forEach((activity) => {
    const row = (activity.rows || []).find((item) => item.studentId === studentId);
    const deadline = row?.effectiveDeadline || activity.deadline;
    const counted = activityDeadlinePassed(deadline) || !!row?.manuallyGraded;
    const submitted = !!row?.submitted;
    details.push({
      title: activity.title,
      type: "Individual",
      status: counted ? submitted ? row.status || (Number(row.daysLate || 0) ? "Late" : "Submitted") : "Missing" : "Upcoming",
      submittedAt: submitted && row.submittedAt ? formatGradeDateTime(row.submittedAt) : "-",
      daysLate: submitted ? Number(row.daysLate || 0) : "-",
      score: counted ? submitted && row.score !== "" && row.score != null ? `${Number(row.score)}%` : "0%" : "Not counted",
      deadline: formatGradeDateTime(deadline)
    });
  });
  (data.groupActivities || []).filter((activity) => (
    activity.subjectId === activeClass.subjectId
      && String(activity.section || "").trim() === activeClass.section
  )).forEach((activity) => {
    const guild = (activity.guildRows || []).find((row) => (row.members || []).some((member) => member.studentId === studentId));
    const grade = guild?.memberGrades?.[studentId];
    const counted = activityDeadlinePassed(activity.deadline) || (grade != null && grade !== "");
    details.push({
      title: activity.title,
      type: "Guild",
      status: counted ? grade == null || grade === "" ? "Missing grade" : "Graded" : "Upcoming",
      submittedAt: "-",
      daysLate: "-",
      score: counted ? grade == null || grade === "" ? "0%" : `${Number(grade)}%` : "Not counted",
      deadline: formatGradeDateTime(activity.deadline)
    });
  });
  return details.sort((a, b) => String(a.deadline).localeCompare(String(b.deadline), undefined, { numeric: true }));
}

function formatCurrentGrade(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function deleteWrittenWork(work, run) {
  return confirm(`Delete ${work.title}? This removes all recorded written work scores.`)
    && run(() => del(`/admin/written-works/${work.id}`), "Written work deleted");
}

function exportWrittenWork(work) {
  exportSpreadsheet(`written-work-${safeFilePart(work.title)}-${safeFilePart(work.subjectName)}.xls`, [
    "Student", "Written Work", "Subject", "Section", "Date", "Max Score", "Score", "Percent", "Remarks"
  ], [...(work.rows || [])].sort((a, b) => String(a.studentName).localeCompare(String(b.studentName))).map((row) => [
    row.studentName, work.title, work.subjectName, work.section, work.date, work.maxScore, row.score ?? "", row.percent === "" ? "" : `${row.percent}%`, work.remarks || ""
  ]), work.title);
}

function exportGrades(activeClass, rows) {
  exportSpreadsheet(`grades-${safeFilePart(activeClass.subjectName)}-${safeFilePart(activeClass.sectionLabel)}.xls`, [
    "Student", "Subject", "Section", "Raw Grade", "Final Grade", "Grade Status", "Activities", "Attendance", "Quizzes", "Exams", "Risk", "Priority", "Missing", "Advice"
  ], rows.map((row) => [
    row.studentName, row.subjectName, row.section, formatCurrentGrade(row.rawGrade ?? row.currentGrade), row.transmutation?.active ? formatCurrentGrade(row.finalGrade ?? row.currentGrade) : "", row.transmutation?.active ? "Transmuted" : "Raw", categoryPercent(row, "activities"), categoryPercent(row, "attendance"), categoryPercent(row, "quizzes"), categoryPercent(row, "majorExams"), row.riskStatus, row.priority, (row.missingItems || []).join(", "), row.visibleAdvice
  ]), "Grades");
}
