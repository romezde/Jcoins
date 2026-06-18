import React, { useState } from "react";
import { CheckCircle2, Lock, Sparkles, Wand2 } from "lucide-react";
import { post, request } from "../api.js";
import { Field, Panel, Select, Table } from "../components/ui.jsx";

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
  return <StaffGuildCeremony guild={guild} run={run} role={role} revealSeconds={data.settings?.guild?.revealSeconds} />;
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

function StaffGuildCeremony({ guild, run, role, revealSeconds = 10 }) {
  const [search, setSearch] = useState("");
  const [ceremony, setCeremony] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);
  const [randomOpen, setRandomOpen] = useState(false);
  const [randomResult, setRandomResult] = useState(null);
  const [bulkReveal, setBulkReveal] = useState(null);
  const [loadingReveal, setLoadingReveal] = useState(false);
  const revealMs = clamp(Number(revealSeconds || 10), 3, 60) * 1000;
  const students = guild.students || [];
  const q = search.trim().toLowerCase();
  const filteredStudents = students.filter((student) => !q || [student.studentName, student.section, student.status, student.assignedGuild].some((value) => String(value || "").toLowerCase().includes(q)));
  const readyStudents = students.filter((student) => student.submitted && !student.revealed);
  const notSubmitted = students.filter((student) => !student.submitted).length;
  const sectionDistributions = guild.distributionBySection?.length
    ? guild.distributionBySection
    : [{ section: "All sections", guilds: guild.distribution || [] }];

  const rows = filteredStudents.map((student) => {
    const guildText = student.assignedGuild || (role === "admin" && student.hiddenAssignedGuild ? `${student.hiddenAssignedGuild} (hidden)` : student.submitted ? "Hidden" : "-");
    const actions = <div className="inline">
      {student.submitted && !student.revealed
        ? <button type="button" className="soft" disabled={guild.status !== "ceremony_active" || loadingReveal} onClick={() => setCeremony({ phase: "ready", student })}>Reveal</button>
        : null}
      {role === "admin" && <button type="button" className="soft" onClick={() => setAssignTarget(student)}>Assign</button>}
      {role === "admin" && student.submitted && <button type="button" className="danger" onClick={() => removeGuild(student)}>Remove</button>}
    </div>;
    return [
    student.studentName,
    student.section || "No section",
    <span className={`guild-status-pill ${student.revealed ? "revealed" : student.submitted ? "ready" : ""}`}>{student.status}</span>,
    guildText,
    actions
  ];
  });

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

  async function revealAll() {
    if (!readyStudents.length || guild.status !== "ceremony_active") return;
    if (!confirm(`Reveal all ${readyStudents.length} ready student${readyStudents.length === 1 ? "" : "s"}?`)) return;
    const result = await run(() => post("/admin/guild/reveal-all", {}), "All ready guilds revealed");
    if (result?.revealed) setBulkReveal(result.revealed);
  }

  async function removeGuild(student) {
    if (!confirm(`Remove guild assignment for ${student.studentName}?`)) return;
    await run(() => post(`/admin/guild/students/${student.studentId}/remove`, {}), "Guild removed");
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
        <button type="button" className="soft" disabled={guild.status !== "ceremony_active" || !readyStudents.length} onClick={revealAll}>Reveal All</button>
        <button type="button" className="soft" onClick={() => setRandomOpen(true)}>Random by Section</button>
      </div>
    </section>
    <div className="guild-stat-grid">
      <section className="panel stat"><span>Ready</span><strong>{readyStudents.length}</strong></section>
      <section className="panel stat"><span>Not Submitted</span><strong>{notSubmitted}</strong></section>
    </div>
    <section className="panel wide guild-section-distribution">
      <div className="section-title">Guilds By Section</div>
      <div className="guild-section-grid">
        {sectionDistributions.map((section) => <div className="guild-section-card" key={section.section}>
          <strong>{section.section}</strong>
          <div className="guild-section-counts">
            {(section.guilds || []).map((item) => <span key={item.id}><b>{item.count}</b>{item.name}</span>)}
          </div>
        </div>)}
      </div>
    </section>
    <Panel title="Sorting List" wide defaultOpen actions={<Field label="" value={search} onChange={setSearch} />}>
      <Table columns={["Student", "Section", "Status", "Guild", "Ceremony"]} rows={rows} />
    </Panel>
    {assignTarget && <AssignGuildModal
      guild={guild}
      student={assignTarget}
      run={run}
      onClose={() => setAssignTarget(null)}
    />}
    {randomOpen && <RandomGuildModal
      guild={guild}
      run={run}
      onClose={() => setRandomOpen(false)}
      onDone={(result) => setRandomResult(result)}
    />}
    {randomResult && <GuildAssignmentResult result={randomResult} onClose={() => setRandomResult(null)} />}
    {bulkReveal && <div className="modal-backdrop guild-result-backdrop" role="dialog" aria-modal="true">
      <GuildConfetti />
      <section className="modal-card modal-card-wide guild-bulk-reveal-modal">
        <div className="section-head">
          <div className="section-title">Guilds Revealed</div>
          <button type="button" className="soft" onClick={() => setBulkReveal(null)}>Close</button>
        </div>
        <div className="guild-bulk-list">
          {bulkReveal.length ? bulkReveal.map((item) => <div className="guild-bulk-card" key={item.studentId}>
            <strong>{item.studentName}</strong>
            <span>{item.section || "No section"}</span>
            <b>{item.guild?.name || "Guild"}</b>
          </div>) : <p className="muted-line">No ready students were waiting to be revealed.</p>}
        </div>
      </section>
    </div>}
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

function AssignGuildModal({ guild, student, run, onClose }) {
  const [guildId, setGuildId] = useState(student.assignedGuildId || guild.guilds?.[0]?.id || "");
  const options = (guild.guilds || []).map((item) => ({ value: item.id, label: item.name }));
  async function save() {
    const ok = await run(() => post(`/admin/guild/students/${student.studentId}/assign`, { guildId }), "Guild assigned");
    if (ok) onClose();
  }
  return <div className="modal-backdrop" role="dialog" aria-modal="true">
    <section className="modal-card">
      <div className="section-head">
        <div className="section-title">Assign Guild</div>
        <button type="button" className="soft" onClick={onClose}>Close</button>
      </div>
      <div className="guild-assign-body">
        <p><strong>{student.studentName}</strong>{student.section ? ` - ${student.section}` : ""}</p>
        <Select label="Guild" value={guildId} onChange={setGuildId} options={options} />
        <p className="muted-line">This stays hidden from the student until the Sorting Ceremony reveal.</p>
        <button type="button" disabled={!guildId} onClick={save}>Save Guild Assignment</button>
      </div>
    </section>
  </div>;
}

function RandomGuildModal({ guild, run, onClose, onDone }) {
  const sections = (guild.distributionBySection || [])
    .map((item) => item.section)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const [section, setSection] = useState(sections[0] || "");
  async function distribute() {
    if (!section) return;
    if (!confirm(`Randomly distribute ${section} into guilds? Existing guild assignments for this section will be replaced.`)) return;
    const result = await run(() => post("/admin/guild/random-distribute", { section }), "Guilds distributed");
    if (result) {
      onDone(result);
      onClose();
    }
  }
  return <div className="modal-backdrop" role="dialog" aria-modal="true">
    <section className="modal-card">
      <div className="section-head">
        <div className="section-title">Random Guild Distribution</div>
        <button type="button" className="soft" onClick={onClose}>Close</button>
      </div>
      <div className="guild-assign-body">
        <Select label="Section" value={section} onChange={setSection} options={sections.map((item) => ({ value: item, label: item }))} />
        <p className="muted-line">This skips the personality test and evenly shuffles the selected section across all guilds.</p>
        <button type="button" disabled={!section} onClick={distribute}>Distribute Randomly</button>
      </div>
    </section>
  </div>;
}

function GuildAssignmentResult({ result, onClose }) {
  return <div className="modal-backdrop guild-result-backdrop" role="dialog" aria-modal="true">
    <GuildConfetti />
    <section className="modal-card modal-card-wide guild-bulk-reveal-modal">
      <div className="section-head">
        <div className="section-title">Random Guilds Assigned</div>
        <button type="button" className="soft" onClick={onClose}>Close</button>
      </div>
      <p className="muted-line">{result.assignedCount || 0} student{result.assignedCount === 1 ? "" : "s"} assigned in {result.section || "section"}.</p>
      <div className="guild-bulk-list">
        {(result.assignments || []).map((item) => <div className="guild-bulk-card" key={item.studentId}>
          <strong>{item.studentName}</strong>
          <span>{item.section || "No section"}</span>
          <b>{item.guild?.name || "Guild"}</b>
        </div>)}
      </div>
    </section>
  </div>;
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
