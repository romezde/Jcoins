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
    }, 3300);
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
      <div className="name-wheel" style={{ background: wheelGradient, transform: `rotate(${rotation}deg)` }}>
        <div className="wheel-labels">
          {students.slice(0, labelLimit).map((student, index) => {
            const angle = (index + .5) * (360 / students.length);
            return <span
              key={student.id}
              className="wheel-slice-name"
              style={{ "--angle": `${angle}deg`, "--text-rotate": `${angle > 90 && angle < 270 ? 180 : 0}deg` }}
              title={student.name}
            >
              {shortName(student.name)}
            </span>;
          })}
        </div>
        <div className="wheel-core">
          <strong>{spinning ? "..." : students.length || 0}</strong>
          <span>{students.length > labelLimit ? `top ${labelLimit} shown` : spinning ? "choosing" : "names"}</span>
        </div>
      </div>
    </div>
    {winner && <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card wheel-result-modal">
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

function shortName(name = "") {
  const clean = String(name).trim();
  if (clean.length <= 16) return clean;
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0]} ${parts.at(-1)?.[0] || ""}.`.slice(0, 16);
  return `${clean.slice(0, 14)}..`;
}
