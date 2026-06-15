import React, { useState } from "react";
import { CheckCircle2, Lock, Sparkles, Wand2 } from "lucide-react";
import { post, request } from "../api.js";
import { Field, Panel, Table } from "../components/ui.jsx";

const likert = [
  { value: 1, label: "Strongly Disagree" },
  { value: 2, label: "Disagree" },
  { value: 3, label: "Neutral" },
  { value: 4, label: "Agree" },
  { value: 5, label: "Strongly Agree" }
];

const statusLabels = {
  not_started: "Not Started",
  open: "Open",
  locked: "Locked",
  ceremony_active: "Ceremony Active"
};

const confettiColors = ["#facc15", "#22d3ee", "#fb7185", "#86efac", "#a78bfa", "#fb923c", "#f472b6"];

export default function GuildAffinity({ data, run, role }) {
  const guild = data.guildSystem || {};
  if (role === "student") return <StudentGuildAssessment guild={guild} run={run} />;
  return <StaffGuildCeremony guild={guild} run={run} revealSeconds={data.settings?.guild?.revealSeconds} />;
}

function StudentGuildAssessment({ guild, run }) {
  const questions = guild.questions || [];
  const response = guild.response;
  const [answers, setAnswers] = useState({});
  const answeredCount = Object.keys(answers).length;
  const complete = answeredCount === questions.length && questions.length > 0;

  if (response?.revealed && response.assignedGuild) {
    return <section className="panel wide guild-result-card">
      <div className="section-title"><Sparkles /> Sorting Complete</div>
      <p className="guild-kicker">Congratulations!</p>
      <h2>Welcome to the {response.assignedGuild.name}</h2>
      <p>{response.assignedGuild.message}</p>
    </section>;
  }

  if (response) {
    return <section className="panel wide guild-wait-card">
      <CheckCircle2 size={44} />
      <div>
        <div className="section-title">Assessment Complete</div>
        <p>Awaiting Sorting Ceremony.</p>
      </div>
    </section>;
  }

  if (guild.status !== "open") {
    return <section className="panel wide">
      <div className="section-title">Guild Affinity Assessment</div>
      <p className="muted">The assessment is not open yet.</p>
    </section>;
  }

  async function submit(e) {
    e.preventDefault();
    if (!complete) return;
    await run(() => post("/student/guild/submit", { answers }), "Assessment submitted");
  }

  return <form className="guild-assessment" onSubmit={submit}>
    <section className="panel wide guild-intro">
      <div className="section-title"><Wand2 /> Guild Affinity Assessment</div>
      <p>Answer honestly. Your guild is hidden until the Sorting Ceremony.</p>
      <div className="guild-progress"><span>{answeredCount}/{questions.length} answered</span><i style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }} /></div>
    </section>
    <div className="guild-question-list">
      {questions.map((question, index) => <section className="panel guild-question" key={question.id}>
        <div className="guild-question-text"><span>{index + 1}</span>{question.text}</div>
        <div className="likert-row">
          {likert.map((item) => <button
            type="button"
            key={item.value}
            className={Number(answers[question.id]) === item.value ? "active" : ""}
            onClick={() => setAnswers({ ...answers, [question.id]: item.value })}
            aria-label={item.label}
          >
            <strong>{item.value}</strong>
            <small>{item.label}</small>
          </button>)}
        </div>
      </section>)}
    </div>
    <section className="panel wide guild-submit-bar">
      <button type="submit" disabled={!complete}>Submit Assessment</button>
      {!complete && <span>Answer all 20 questions first.</span>}
    </section>
  </form>;
}

function StaffGuildCeremony({ guild, run, revealSeconds = 10 }) {
  const [search, setSearch] = useState("");
  const [ceremony, setCeremony] = useState(null);
  const [loadingReveal, setLoadingReveal] = useState(false);
  const revealMs = clamp(Number(revealSeconds || 10), 3, 60) * 1000;
  const students = guild.students || [];
  const q = search.trim().toLowerCase();
  const filteredStudents = students.filter((student) => !q || [student.studentName, student.section, student.status, student.assignedGuild].some((value) => String(value || "").toLowerCase().includes(q)));
  const readyStudents = students.filter((student) => student.submitted && !student.revealed);
  const notSubmitted = students.filter((student) => !student.submitted).length;

  const rows = filteredStudents.map((student) => [
    student.studentName,
    student.section || "No section",
    <span className={`guild-status-pill ${student.revealed ? "revealed" : student.submitted ? "ready" : ""}`}>{student.status}</span>,
    student.assignedGuild || (student.submitted ? "Hidden" : "-"),
    student.submitted && !student.revealed
      ? <button type="button" className="soft" disabled={guild.status !== "ceremony_active" || loadingReveal} onClick={() => setCeremony({ phase: "ready", student })}>Reveal</button>
      : "-"
  ]);

  async function beginReveal(student) {
    if (guild.status !== "ceremony_active" || loadingReveal) return;
    setLoadingReveal(true);
    try {
      const preview = await request(`/admin/guild/students/${student.studentId}/preview`);
      setCeremony({ phase: "traits", student, traits: preview.traits || [] });
      window.setTimeout(async () => {
        const result = await run(() => post(`/admin/guild/students/${student.studentId}/reveal`, {}), "Guild revealed");
        if (result?.guild) setCeremony({ phase: "result", student, guild: result.guild });
        setLoadingReveal(false);
      }, revealMs);
    } catch {
      setLoadingReveal(false);
    }
  }

  return <>
    <section className="panel wide guild-admin-hero">
      <div>
      <div className="section-title"><Sparkles /> Guild Affinity Assessment</div>
      <p>Status: <strong>{statusLabels[guild.status] || "Not Started"}</strong> - Reveal: <strong>{Math.round(revealMs / 1000)}s</strong></p>
      </div>
      <div className="quick-actions guild-actions">
        <button type="button" onClick={() => run(() => post("/admin/guild/start-assessment", {}), "Guild assessment opened")}>Start Assessment</button>
        <button type="button" className="soft" onClick={() => run(() => post("/admin/guild/lock-assessment", {}), "Guild assessment locked")}><Lock size={16} /> End / Lock</button>
        <button type="button" className="soft" onClick={() => run(() => post("/admin/guild/start-ceremony", {}), "Sorting Ceremony started")}><Wand2 size={16} /> Start Ceremony</button>
      </div>
    </section>
    <div className="guild-stat-grid">
      <section className="panel stat"><span>Ready</span><strong>{readyStudents.length}</strong></section>
      <section className="panel stat"><span>Not Submitted</span><strong>{notSubmitted}</strong></section>
      {(guild.distribution || []).map((item) => <section className="panel stat guild-count" key={item.id}><span>{item.name}</span><strong>{item.count}</strong></section>)}
    </div>
    <Panel title="Sorting List" wide defaultOpen actions={<Field label="" value={search} onChange={setSearch} />}>
      <Table columns={["Student", "Section", "Status", "Guild", "Ceremony"]} rows={rows} />
    </Panel>
    {ceremony?.phase === "ready" && <div className="modal-backdrop guild-start-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card guild-start-modal">
        <p className="guild-kicker">Sorting Ceremony</p>
        <h2>{ceremony.student.studentName}</h2>
        <p>Put your hand in the circle.</p>
        <button type="button" className="guild-hand-circle" disabled={loadingReveal} onClick={() => beginReveal(ceremony.student)}>
          <Sparkles size={42} />
          <span>{loadingReveal ? "Reading..." : "Start"}</span>
        </button>
        <button type="button" className="soft" disabled={loadingReveal} onClick={() => setCeremony(null)}>Close</button>
      </section>
    </div>}
    {ceremony?.phase === "traits" && <CeremonyOverlay student={ceremony.student} traits={ceremony.traits} />}
    {ceremony?.phase === "result" && <div className="modal-backdrop guild-result-backdrop" role="dialog" aria-modal="true">
      <GuildConfetti />
      <section className="modal-card guild-reveal-modal">
        <p className="guild-kicker">Congratulations!</p>
        <h2>{ceremony.student.studentName}</h2>
        <h3>Welcome to the {ceremony.guild.name}</h3>
        <p>{ceremony.guild.message}</p>
        <button type="button" onClick={() => setCeremony(null)}>Close</button>
      </section>
    </div>}
  </>;
}

function CeremonyOverlay({ student, traits }) {
  const words = traits.length ? traits : ["Curiosity", "Strategy", "Creativity", "Responsibility"];
  return <div className="guild-ceremony-overlay" role="dialog" aria-modal="true">
    <div className="guild-ceremony-core">
      <small>Sorting</small>
      <strong>{student.studentName}</strong>
      <span>Reading affinity...</span>
    </div>
    {words.map((trait, index) => <span key={`${trait}-${index}`} className={`guild-trait trait-${index % 8}`}>{trait}</span>)}
  </div>;
}

function GuildConfetti() {
  return <div className="confetti-burst" aria-hidden="true">
    {Array.from({ length: 120 }, (_, index) => <span key={index} style={{
      "--angle": `${index * 11.9}deg`,
      "--x": `${((index * 47) % 120) - 60}vw`,
      "--distance": `${54 + (index % 10) * 6}vh`,
      "--delay": `${(index % 14) * .014}s`,
      "--color": confettiColors[index % confettiColors.length]
    }} />)}
  </div>;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
