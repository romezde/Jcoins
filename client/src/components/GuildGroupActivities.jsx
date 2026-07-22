import React, { useEffect, useMemo, useState } from "react";
import { Crown, Pencil, Users, Vote } from "lucide-react";
import { del, post, put, today } from "../api.js";
import { ActionModal, Field, Panel, Select, Table } from "./ui.jsx";
import SubjectSectionPicker, { buildSubjectSectionClasses } from "./SubjectSectionPicker.jsx";

export default function GuildGroupActivities({ data, run, role }) {
  const activities = data.groupActivities || [];
  if (role === "student") return <StudentGroupActivities activities={activities} run={run} />;
  return <StaffGroupActivities data={data} run={run} activities={activities} />;
}

function StaffGroupActivities({ data, run, activities }) {
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const classes = useMemo(() => buildSubjectSectionClasses(data, (subjectId, section) => activities.filter((activity) => activity.subjectId === subjectId && String(activity.section || "").trim() === section).length), [data.subjects, data.students, activities]);
  const activeClass = classes.find((item) => item.key === selectedClassKey) || null;
  const classActivities = activeClass ? activities.filter((activity) => activity.subjectId === activeClass.subjectId && String(activity.section || "").trim() === activeClass.section) : [];
  return <div className="dashboard-grid guild-group-activities">
    <GroupActivityForm data={data} run={run} />
    <SubjectSectionPicker classes={classes} selectedKey={selectedClassKey} onSelect={setSelectedClassKey} title="Group Activity Classes" itemLabel="group activities" />
    {activeClass && <section className="panel wide guild-group-heading">
      <div className="section-head">
        <div>
          <div className="section-title"><Users size={20} /> {activeClass.subjectName} - {activeClass.sectionLabel}</div>
          <p className="muted-line">Activities are completed and graded by each guild separately.</p>
        </div>
        <div className="inline">
          <span className="filter-count">{classActivities.length} group activit{classActivities.length === 1 ? "y" : "ies"}</span>
          <GroupActivityForm data={data} run={run} presetClass={activeClass} buttonLabel="Create Group Activity for This Class" />
        </div>
      </div>
    </section>}
    {activeClass && classActivities.map((activity) => <StaffGroupActivity key={activity.id} activity={activity} data={data} run={run} />)}
    {!activeClass && <section className="panel wide attendance-empty">Choose a subject and section above to view guild group activities.</section>}
    {activeClass && !classActivities.length && <section className="panel wide attendance-empty">No guild group activities found for this class.</section>}
  </div>;
}

function GroupActivityForm({ data, run, activity = null, presetClass = null, buttonLabel = null }) {
  const [form, setForm] = useState(() => groupActivityForm(activity, data, presetClass));
  useEffect(() => setForm(groupActivityForm(activity, data, presetClass)), [activity?.id, activity?.updatedAt, presetClass?.key]);
  const difficulties = (data.settings?.quizzes?.difficulties || []).map((item) => ({ value: item.name, label: `${item.name} - up to ${item.points} JC` }));
  async function submit(event) {
    event.preventDefault();
    await run(
      () => activity
        ? put(`/admin/guild/group-activities/${activity.id}`, form)
        : post("/admin/guild/group-activities", form),
      activity ? "Group activity updated" : "Group activity created"
    );
  }
  return <ActionModal title={activity ? `Edit ${activity.title}` : "Create Guild Group Activity"} buttonLabel={buttonLabel || (activity ? "Edit" : "Create Group Activity")} icon={activity ? Pencil : undefined}>
    <form onSubmit={submit}>
      <Field label="Activity Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
      <div className="form-grid two">
        <Select label="Subject" value={form.subjectId} onChange={(subjectId) => setForm({ ...form, subjectId })} options={data.subjects || []} />
        <Select label="Section" value={form.section} onChange={(section) => setForm({ ...form, section })} options={(data.sections || []).map((item) => ({ value: item, label: item }))} />
        <Select label="Difficulty" value={form.difficulty} onChange={(difficulty) => setForm({ ...form, difficulty })} options={difficulties} />
        <Field label="Deadline" type="datetime-local" value={form.deadline} onChange={(deadline) => setForm({ ...form, deadline })} />
      </div>
      <label>Instructions<textarea value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} /></label>
      {activity?.hasProgress && <p className="muted-line">Subject and section are locked after voting or grading starts.</p>}
      <button>{activity ? "Save Changes" : "Create Group Activity"}</button>
    </form>
  </ActionModal>;
}

function groupActivityForm(activity, data, presetClass = null) {
  return {
    title: activity?.title || "",
    subjectId: activity?.subjectId || presetClass?.subjectId || data.subjects?.[0]?.id || "",
    section: activity?.section || presetClass?.section || data.sections?.[0] || "",
    difficulty: activity?.difficulty || "Easy",
    deadline: String(activity?.deadline || `${today()}T23:59`).slice(0, 16),
    instructions: activity?.instructions || ""
  };
}

function StaffGroupActivity({ activity, data, run }) {
  return <Panel
    title={activity.title}
    wide
    defaultOpen={false}
    actions={<div className="inline">
      <GroupActivityForm data={data} run={run} activity={activity} />
      <button className="danger" type="button" onClick={() => confirm(`Delete ${activity.title}? Its guild grades and JCoins will also be removed.`) && run(() => del(`/admin/guild/group-activities/${activity.id}`), "Group activity deleted")}>Delete</button>
    </div>}
  >
    <p className="muted-line">{activity.subjectName} | {activity.section} | {activity.difficulty} | up to {activity.rewardValue} JC | deadline {formatDateTime(activity.deadline)}</p>
    {activity.instructions && <p className="guild-group-instructions">{activity.instructions}</p>}
    <div className="guild-group-grid">
      {(activity.guildRows || []).map((guild) => <StaffGuildGrade key={guild.guildId} activity={activity} guild={guild} run={run} />)}
    </div>
    {!activity.guildRows?.length && <div className="notice">No revealed guild members are enrolled in this subject and section yet.</div>}
  </Panel>;
}

function StaffGuildGrade({ activity, guild, run }) {
  const [score, setScore] = useState(guild.teacherScore ?? "");
  const [leaderId, setLeaderId] = useState(guild.leaderId || guild.proposedLeaderId || guild.members[0]?.studentId || "");
  useEffect(() => setScore(guild.teacherScore ?? ""), [guild.teacherScore]);
  useEffect(() => setLeaderId(guild.leaderId || guild.proposedLeaderId || guild.members[0]?.studentId || ""), [guild.leaderId, guild.proposedLeaderId, guild.members.length]);
  const gradeRows = guild.members.map((member) => [
    member.studentName,
    member.studentId === guild.leaderId ? "Leader" : "Member",
    guild.memberGrades?.[member.studentId] ?? "Waiting"
  ]);
  const leaderOptions = guild.members.map((member) => ({ value: member.studentId, label: member.studentName }));
  return <section className="guild-group-card">
    <div className="section-head">
      <div>
        <strong>{guild.guildName}</strong>
        <small>{guild.members.length} member{guild.members.length === 1 ? "" : "s"}</small>
      </div>
      {guild.leaderName && <span className="guild-leader-pill"><Crown size={15} /> {guild.leaderName}</span>}
    </div>
    <div className="guild-vote-summary">
      <strong><Vote size={16} /> Leader Votes</strong>
      {(guild.voteRanking || []).map((candidate) => <span key={candidate.studentId}>{candidate.studentName}: <b>{candidate.votes}</b></span>)}
    </div>
    {!guild.leaderId && <p className="muted-line">Current vote leader: {guild.proposedLeaderName || "No votes yet"}. Grading finalizes the leader; ties are resolved alphabetically.</p>}
    <div className="guild-leader-assign">
      <Select label="Assigned Leader" value={leaderId} onChange={setLeaderId} options={leaderOptions} />
      <button type="button" disabled={!leaderId || leaderId === guild.leaderId} onClick={() => run(() => put(`/admin/guild/group-activities/${activity.id}/leader`, { guildId: guild.guildId, leaderId }), "Group leader assigned")}>{guild.leaderId ? "Change Leader" : "Assign Leader"}</button>
    </div>
    <div className="guild-teacher-grade">
      <Field label="Teacher Grade (Leader Grade)" type="number" min="0" max="100" value={score} onChange={setScore} />
      <button type="button" disabled={score === "" || !guild.leaderId && !guild.proposedLeaderId} onClick={() => run(() => put(`/admin/guild/group-activities/${activity.id}/grade`, { guildId: guild.guildId, score }), guild.leaderId ? "Teacher grade updated" : "Leader finalized and graded")}>{guild.leaderId ? "Update Grade" : "Finalize Leader & Grade"}</button>
    </div>
    {guild.teacherScore != null && <>
      <p className="muted-line">The leader automatically receives {guild.teacherScore}. Other grades are assigned by the leader, up to {guild.teacherScore}.</p>
      <Table columns={["Member", "Role", "Grade"]} rows={gradeRows} pageSize={20} />
    </>}
  </section>;
}

function StudentGroupActivities({ activities, run }) {
  if (!activities.length) return null;
  return <div className="dashboard-grid guild-group-activities">
    <section className="panel wide guild-group-heading">
      <div className="section-title"><Users size={20} /> Guild Group Activities</div>
      <p className="muted-line">Vote for your activity leader and check your assigned group grade here.</p>
    </section>
    {activities.map((activity) => <StudentGroupActivity key={activity.id} activity={activity} run={run} />)}
  </div>;
}

function StudentGroupActivity({ activity, run }) {
  const [candidateId, setCandidateId] = useState(activity.myVote || "");
  useEffect(() => setCandidateId(activity.myVote || ""), [activity.myVote, activity.id]);
  return <Panel title={activity.title} wide defaultOpen>
    <p className="muted-line">{activity.subjectName} | {activity.section} | {activity.guildName} | {activity.difficulty} | up to {activity.rewardValue} JC | deadline {formatDateTime(activity.deadline)}</p>
    {activity.instructions && <p className="guild-group-instructions">{activity.instructions}</p>}
    {activity.leaderId ? <div className="notice"><Crown size={17} /> Leader: <strong>{activity.leaderName}</strong>. The leader earns an additional 20 JCoins.</div> : <section className="guild-student-vote">
      <strong><Vote size={17} /> Vote for Activity Leader</strong>
      <div className="guild-vote-options">
        {activity.members.map((member) => <label className="check" key={member.studentId}>
          <input type="radio" name={`leader-${activity.id}`} checked={candidateId === member.studentId} disabled={!activity.canVote} onChange={() => setCandidateId(member.studentId)} />
          {member.studentName}
        </label>)}
      </div>
      {activity.canVote
        ? <button type="button" disabled={!candidateId} onClick={() => run(() => post(`/student/guild/group-activities/${activity.id}/vote`, { candidateId }), "Leader vote saved")}>{activity.myVote ? "Update Vote" : "Submit Vote"}</button>
        : <p className="muted-line">Leader voting is closed.</p>}
    </section>}
    {activity.teacherScore != null && <div className="guild-grade-result">
      <span>Teacher's highest grade <strong>{activity.teacherScore}</strong></span>
      <span>Your grade <strong>{activity.myGrade ?? "Waiting for leader"}</strong></span>
    </div>}
    {activity.canDistribute && <LeaderGradeDistribution activity={activity} run={run} />}
  </Panel>;
}

function LeaderGradeDistribution({ activity, run }) {
  const nonLeaders = activity.members.filter((member) => member.studentId !== activity.leaderId);
  const [grades, setGrades] = useState(() => Object.fromEntries(nonLeaders.map((member) => [member.studentId, activity.memberGrades?.[member.studentId] ?? ""])));
  useEffect(() => {
    setGrades(Object.fromEntries(nonLeaders.map((member) => [member.studentId, activity.memberGrades?.[member.studentId] ?? ""])));
  }, [activity.id, activity.teacherScore, JSON.stringify(activity.memberGrades || {})]);
  return <section className="guild-grade-distribution">
    <div className="section-title"><Crown size={18} /> Distribute Member Grades</div>
    <p className="muted-line">Your grade is fixed at {activity.teacherScore}. Every member grade must be from 0 to {activity.teacherScore}.</p>
    <div className="guild-member-grade-grid">
      {nonLeaders.map((member) => <Field key={member.studentId} label={member.studentName} type="number" min="0" max={activity.teacherScore} value={grades[member.studentId]} onChange={(grade) => setGrades({ ...grades, [member.studentId]: grade })} />)}
    </div>
    <button type="button" disabled={nonLeaders.some((member) => grades[member.studentId] === "")} onClick={() => run(() => put(`/student/guild/group-activities/${activity.id}/distribute`, { grades }), "Member grades saved")}>Save Member Grades</button>
  </section>;
}

function formatDateTime(value) {
  if (!value) return "No deadline";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
