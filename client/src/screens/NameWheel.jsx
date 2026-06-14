import React, { useMemo, useState } from "react";
import { Shuffle } from "lucide-react";
import { request } from "../api.js";
import { ProfilePhotoFrame } from "../components/ProfilePhoto.jsx";
import { Field, Select } from "../components/ui.jsx";

const colors = ["#facc15", "#22d3ee", "#fb7185", "#86efac", "#a78bfa", "#fb923c", "#38bdf8", "#f472b6"];
const labelLimit = 40;

export default function NameWheel({ data }) {
  const [section, setSection] = useState("all");
  const [search, setSearch] = useState("");
  const [winner, setWinner] = useState(null);
  const [winnerPhotoLoading, setWinnerPhotoLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const spinSeconds = clamp(Number(data.settings?.wheel?.spinSeconds || 3.3), 1, 12);

  const sections = useMemo(() => [...new Set((data.students || []).map((student) => student.section).filter(Boolean))].sort(), [data.students]);
  const q = search.trim().toLowerCase();
  const students = (data.students || [])
    .filter((student) => section === "all" || (section === "__none" ? !student.section : student.section === section))
    .filter((student) => !q || [student.name, student.username, student.section, student.rank].some((value) => String(value || "").toLowerCase().includes(q)));
  const wheelGradient = students.length ? `conic-gradient(${students.map((student, index) => {
    const start = (index / students.length) * 100;
    const end = ((index + 1) / students.length) * 100;
    return `${colors[index % colors.length]} ${start}% ${end}%`;
  }).join(", ")})` : "linear-gradient(135deg, rgba(15,23,42,.9), rgba(30,41,59,.9))";

  function spin() {
    if (!students.length || spinning) return;
    const chosenIndex = Math.floor(Math.random() * students.length);
    const segment = 360 / students.length;
    const target = 360 - (chosenIndex * segment + segment / 2);
    const currentMod = ((rotation % 360) + 360) % 360;
    const nextRotation = rotation + 1440 + ((target - currentMod + 360) % 360);
    setWinner(null);
    setWinnerPhotoLoading(false);
    setSpinning(true);
    setRotation(nextRotation);
    window.setTimeout(() => {
      const chosen = students[chosenIndex];
      setWinner(chosen);
      setSpinning(false);
      setWinnerPhotoLoading(true);
      request(`/admin/students/${chosen.id}/profile-photo`)
        .then((result) => setWinner((current) => current?.id === chosen.id ? { ...current, profilePhoto: result.profilePhoto || "" } : current))
        .catch(() => {})
        .finally(() => setWinnerPhotoLoading(false));
    }, spinSeconds * 1000);
  }

  return <section className="panel wide wheel-panel">
    <div className="section-head">
      <div className="section-title"><Shuffle /> Wheel of Names</div>
      <button type="button" onClick={spin} disabled={!students.length || spinning}>{spinning ? "Spinning..." : "Spin Wheel"}</button>
    </div>
    <div className="filter-bar">
      <Select label="Section" value={section} onChange={setSection} options={[
        { value: "all", label: "All sections" },
        ...sections.map((name) => ({ value: name, label: `Section ${name}` })),
        ...((data.students || []).some((student) => !student.section) ? [{ value: "__none", label: "No section" }] : [])
      ]} />
      <Field label="Search Students" value={search} onChange={setSearch} />
      <div className="filter-count">{students.length} student{students.length === 1 ? "" : "s"}</div>
    </div>
    <div className="wheel-stage">
      <div className="wheel-pointer" />
      <div className="name-wheel" style={{ background: wheelGradient, transform: `rotate(${rotation}deg)`, transitionDuration: `${spinSeconds}s` }}>
        <WheelLabels students={students.slice(0, labelLimit)} total={students.length} />
        <div className="wheel-core">
          <strong>{spinning ? "..." : students.length || 0}</strong>
          <span>{students.length > labelLimit ? `top ${labelLimit} shown` : spinning ? "choosing" : "names"}</span>
        </div>
      </div>
    </div>
    {winner && <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card wheel-result-modal">
        <ConfettiBurst />
        <div className="section-title">Chosen Student</div>
        <ProfilePhotoFrame student={winner} className="wheel-winner-photo" />
        {winnerPhotoLoading && <p className="photo-loading">Loading photo...</p>}
        <div className="winner-name">{winner.name}</div>
        <p>{winner.section ? `Section ${winner.section}` : "No section"} - {winner.currentJCoins?.toLocaleString?.() || 0} JCoins</p>
        <div className="button-row">
          <button type="button" onClick={() => setWinner(null)}>Close</button>
          <button type="button" className="soft" onClick={spin}>Spin Again</button>
        </div>
      </section>
    </div>}
  </section>;
}

function WheelLabels({ students, total }) {
  if (!students.length) return null;
  const radius = total > 34 ? 33 : total > 22 ? 34.5 : 36;
  const fontSize = total > 36 ? 2.35 : total > 24 ? 2.75 : total > 14 ? 3.25 : 4;
  return <svg className="wheel-svg-labels" viewBox="0 0 100 100" aria-hidden="true">
    {students.map((student, index) => {
      const angle = (index + .5) * (360 / total);
      const rad = angle * Math.PI / 180;
      const x = 50 + Math.sin(rad) * radius;
      const y = 50 - Math.cos(rad) * radius;
      const flip = angle > 90 && angle < 270;
      return <text
        key={student.id}
        x={x}
        y={y}
        fontSize={fontSize}
        textAnchor="middle"
        dominantBaseline="central"
        transform={`rotate(${angle + (flip ? 270 : 90)} ${x} ${y})`}
      >
        {shortName(student.name, total)}
      </text>;
    })}
  </svg>;
}

function ConfettiBurst() {
  return <div className="confetti-burst" aria-hidden="true">
    {Array.from({ length: 34 }, (_, index) => (
      <span key={index} style={{
        "--angle": `${index * 10.6}deg`,
        "--distance": `${70 + (index % 7) * 10}px`,
        "--delay": `${(index % 6) * .025}s`,
        "--color": colors[index % colors.length]
      }} />
    ))}
  </div>;
}

function shortName(name = "") {
  const clean = String(name).trim();
  const max = arguments[1] > 34 ? 12 : arguments[1] > 22 ? 14 : 16;
  if (clean.length <= max) return clean;
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0]} ${parts.at(-1)?.[0] || ""}.`.slice(0, max);
  return `${clean.slice(0, Math.max(5, max - 2))}..`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
