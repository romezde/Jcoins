import React, { useEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import CosmeticFx from "../components/CosmeticFx.jsx";

export default function Leaderboard({ students, currentStudentId }) {
  const [section, setSection] = useState("all");
  const [search, setSearch] = useState("");
  const currentRef = useRef(null);
  const sections = [...new Set(students.map((student) => student.section).filter(Boolean))].sort();
  const q = search.trim().toLowerCase();
  const filtered = (section === "all" ? students : section === "__none" ? students.filter((student) => !student.section) : students.filter((student) => student.section === section))
    .filter((student) => !q || [student.name, student.username, student.section, student.rank].some((value) => String(value || "").toLowerCase().includes(q)));
  const ranked = filtered.map((student, index) => ({ ...student, leaderboardRank: index + 1 }));
  const topRows = ranked.slice(0, 100);
  const currentRow = currentStudentId ? ranked.find((student) => student.id === currentStudentId) : null;
  const showCurrentBelowTop = currentRow && currentRow.leaderboardRank > 100 && !topRows.some((student) => student.id === currentRow.id);
  const visibleRows = showCurrentBelowTop ? [...topRows, { divider: true, id: "current-divider" }, currentRow] : topRows;

  useEffect(() => {
    if (currentRef.current) currentRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentStudentId, section, students.length]);

  return <section className="leaderboard wide">
    <div className="section-head">
      <div className="section-title"><Trophy /> Quest Board</div>
      <select value={section} onChange={(e) => setSection(e.target.value)}>
        <option value="all">Overall Leaderboard</option>
        {sections.map((sectionName) => <option key={sectionName} value={sectionName}>Section {sectionName}</option>)}
        {students.some((student) => !student.section) && <option value="__none">No Section</option>}
      </select>
    </div>
    <div className="leaderboard-search">
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leaderboard names..." />
      <span>{filtered.length} student{filtered.length === 1 ? "" : "s"}</span>
    </div>
    <div className="podium">{podiumOrder(ranked.slice(0, 3)).map((s) => <Champion key={s.id} student={s} place={s.leaderboardRank} />)}</div>
    <div className="rows">{visibleRows.map((s) => s.divider ? <div key={s.id} className="rank-divider">Your current rank</div> : <StudentRow key={s.id} student={s} place={s.leaderboardRank} active={s.id === currentStudentId} rowRef={s.id === currentStudentId ? currentRef : null} />)}</div>
  </section>;
}

function Champion({ student, place }) {
  const appearanceClasses = student.appearance?.classes?.join(" ") || "";
  const badge = student.appearance?.items?.badge?.name;
  return <article className={`champion-card appearance-card place-${place} ${appearanceClasses} ${rankClass(student.rank)}`}>
    <CosmeticFx classes={appearanceClasses} />
    <div className="medal">#{place}</div>
    <LeaderboardAvatar student={student} className="champion-avatar" />
    <h3 className="cosmetic-name">{student.name}</h3>
    {badge && <div className="cosmetic-badge">{badge}</div>}
    <strong>{student.currentJCoins.toLocaleString()} JCoins</strong>
    <span className="rank-chip">{student.rank}</span>
  </article>;
}

function StudentRow({ student, place, active, rowRef }) {
  const appearanceClasses = student.appearance?.classes?.join(" ") || "";
  const badge = student.appearance?.items?.badge?.name;
  return <article ref={rowRef} className={`student-row appearance-card list-place-${place <= 3 ? place : "normal"} ${appearanceClasses} ${rankClass(student.rank)} ${active ? "self-row" : ""}`}>
    <CosmeticFx classes={appearanceClasses} />
    <div className="place">#{place}</div>
    <LeaderboardAvatar student={student} className="leaderboard-avatar" />
    <div className="student-name"><span className="cosmetic-name">{student.name}</span>{badge && <span className="cosmetic-badge">{badge}</span>}</div>
    <div className="coin-count">{student.currentJCoins.toLocaleString()} JC</div>
    <div className="progress-block">
      <div className="progress-label"><span className="rank-text">{student.rank}</span><span>{student.nextRank} {student.progress}%</span></div>
      <div className="bar"><div className="fill" style={{ width: `${student.progress}%` }} /></div>
    </div>
  </article>;
}

function rankClass(rank = "") {
  return `rank-${rank.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unranked"}`;
}

function podiumOrder(topThree) {
  return [topThree[1], topThree[0], topThree[2]].filter(Boolean);
}

function LeaderboardAvatar({ student, className = "" }) {
  const icon = student.appearance?.items?.avatarIcon?.icon;
  return <div className={`cosmetic-avatar ${className} ${icon ? "has-equipped-avatar-icon" : ""}`} title={icon ? `${student.name}'s avatar icon` : `${student.name}'s initials`}>
    {icon || initials(student.name)}
  </div>;
}

function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "J";
}
