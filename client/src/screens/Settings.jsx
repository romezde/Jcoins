import React, { useEffect, useState } from "react";
import { post, put } from "../api.js";
import { Field, Panel, Table } from "../components/ui.jsx";

export default function Settings({ data, run }) {
  const [settings, setSettings] = useState(data.settings);
  const [guildResetConfirm, setGuildResetConfirm] = useState("");
  useEffect(() => setSettings(data.settings), [data.settings]);
  const set = (group, key, value) => setSettings({ ...settings, [group]: { ...(settings[group] || {}), [key]: Number(value) || value } });
  const guildSystem = data.guildSystem || {};
  const guildSubmitted = (guildSystem.students || []).filter((student) => student.submitted).length;
  const guildRevealed = (guildSystem.students || []).filter((student) => student.revealed).length;
  return <div className="dashboard-grid">
    <Panel title="Attendance Settings" defaultOpen={false}>
      <Field label="On Time Points" type="number" value={settings.attendance.onTimePoints} onChange={(v) => set("attendance", "onTimePoints", v)} />
      <Field label="Late Points" type="number" value={settings.attendance.latePoints} onChange={(v) => set("attendance", "latePoints", v)} />
      <Field label="Weekly Bonus" type="number" value={settings.attendance.weeklyBonus} onChange={(v) => set("attendance", "weeklyBonus", v)} />
    </Panel>
    <Panel title="Recitation Settings" defaultOpen={false}>
      <Field label="Max Points" type="number" value={settings.recitation.maxPoints} onChange={(v) => set("recitation", "maxPoints", v)} />
      <Field label="Weekly Bonus" type="number" value={settings.recitation.weeklyBonus} onChange={(v) => set("recitation", "weeklyBonus", v)} />
    </Panel>
    <Panel title="Activity Settings" defaultOpen={false}>
      <Field label="Late Penalty Per Day" type="number" value={settings.activities.latePenaltyPerDay} onChange={(v) => set("activities", "latePenaltyPerDay", v)} />
      <Table columns={["Type", "Base JCoins"]} rows={settings.activities.types.map((type, i) => [
        <input value={type.name} onChange={(e) => setSettings({ ...settings, activities: { ...settings.activities, types: settings.activities.types.map((x, j) => j === i ? { ...x, name: e.target.value } : x) } })} />,
        <input type="number" value={type.points} onChange={(e) => setSettings({ ...settings, activities: { ...settings.activities, types: settings.activities.types.map((x, j) => j === i ? { ...x, points: Number(e.target.value) } : x) } })} />
      ])} />
      <button type="button" className="soft" onClick={() => setSettings({ ...settings, activities: { ...settings.activities, types: [...settings.activities.types, { name: "New Type", points: 10 }] } })}>Add Type</button>
    </Panel>
    <Panel title="Quiz Settings" defaultOpen={false}>
      <Field label="Default Passing Percent" type="number" value={settings.quizzes?.defaultPassingPercent ?? 75} onChange={(v) => set("quizzes", "defaultPassingPercent", v)} />
      <label>Default Answer Reveal
        <select value={settings.quizzes?.defaultAnswerVisibility || "after_deadline"} onChange={(e) => setSettings({ ...settings, quizzes: { ...(settings.quizzes || {}), defaultAnswerVisibility: e.target.value } })}>
          <option value="immediate">Immediately after submission</option>
          <option value="after_deadline">After deadline</option>
          <option value="scheduled">On specific date/time</option>
          <option value="never">Never</option>
        </select>
      </label>
      <Table columns={["Difficulty", "Fixed JCoins"]} rows={(settings.quizzes?.difficulties || []).map((difficulty, i) => [
        difficulty.name,
        <input type="number" value={difficulty.points} onChange={(e) => setSettings({ ...settings, quizzes: { ...(settings.quizzes || {}), difficulties: settings.quizzes.difficulties.map((item, j) => j === i ? { ...item, points: Number(e.target.value) } : item) } })} />
      ])} />
      <button onClick={() => run(() => put("/admin/settings", { settings }), "Quiz settings saved")}>Save Quiz Settings</button>
    </Panel>
    <Panel title="Wheel Settings" defaultOpen={false}>
      <Field label="Spin Duration Seconds" type="number" value={settings.wheel?.spinSeconds ?? 3.3} onChange={(v) => set("wheel", "spinSeconds", v)} />
      <p className="muted-line">Example: 3.3 is quick, 5 is dramatic, 8 is very suspenseful.</p>
      <button onClick={() => run(() => put("/admin/settings", { settings }), "Wheel settings saved")}>Save Wheel Settings</button>
    </Panel>
    <Panel title="Guild Settings" defaultOpen={false}>
      <Field label="Reveal Duration Seconds" type="number" value={settings.guild?.revealSeconds ?? 10} onChange={(v) => set("guild", "revealSeconds", v)} />
      <p className="muted-line">This controls how long the Sorting Ceremony shows traits before the guild appears.</p>
      <div className="metric-strip">
        <section className="metric-tile"><span>Status</span><strong>{guildStatusLabel(guildSystem.status)}</strong></section>
        <section className="metric-tile"><span>Submitted</span><strong>{guildSubmitted}</strong></section>
        <section className="metric-tile"><span>Revealed</span><strong>{guildRevealed}</strong></section>
      </div>
      <div className="button-row">
        <button onClick={() => run(() => put("/admin/settings", { settings }), "Guild settings saved")}>Save Guild Settings</button>
      </div>
      <div className="danger-zone">
        <div>
          <div className="section-title">Reset Guilds</div>
          <p className="muted-line">This clears assessment status, student responses, assigned guilds, and reveal history.</p>
        </div>
        <Field label='Type "RESET" to confirm' value={guildResetConfirm} onChange={setGuildResetConfirm} />
        <button
          type="button"
          className="danger"
          disabled={guildResetConfirm !== "RESET"}
          onClick={() => run(() => post("/admin/guild/reset", {}), "Guild system reset").then((ok) => ok && setGuildResetConfirm(""))}
        >
          Reset All Guilds
        </button>
      </div>
    </Panel>
    <Panel title="Ranks" wide defaultOpen={false}>
      <Table columns={["Rank", "Minimum"]} rows={settings.ranks.map((r, i) => [
        <input value={r.name} onChange={(e) => setSettings({ ...settings, ranks: settings.ranks.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} />,
        <input type="number" value={r.min} onChange={(e) => setSettings({ ...settings, ranks: settings.ranks.map((x, j) => j === i ? { ...x, min: Number(e.target.value) } : x) })} />
      ])} />
      <div className="button-row">
        <button className="soft" onClick={() => setSettings({ ...settings, ranks: [...settings.ranks, { name: "New Rank", min: 0 }] })}>Add Rank</button>
        <button onClick={() => run(() => put("/admin/settings", { settings }), "Settings saved")}>Save Settings</button>
      </div>
    </Panel>
  </div>;
}

function guildStatusLabel(status) {
  return {
    not_started: "Not Started",
    open: "Open",
    locked: "Locked",
    ceremony_active: "Ceremony Active"
  }[status] || "Not Started";
}
