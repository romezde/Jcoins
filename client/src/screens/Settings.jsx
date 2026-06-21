import React, { useEffect, useState } from "react";
import { post, put, request } from "../api.js";
import { Field, Panel, Select, Table } from "../components/ui.jsx";

export default function Settings({ data, run }) {
  const [settings, setSettings] = useState(data.settings);
  const [guildResetConfirm, setGuildResetConfirm] = useState("");
  const [storageHealth, setStorageHealth] = useState(null);
  const [storageError, setStorageError] = useState("");
  const [storageLoading, setStorageLoading] = useState(false);
  useEffect(() => setSettings(data.settings), [data.settings]);
  useEffect(() => {
    const refresh = () => loadStorageHealth(setStorageHealth, setStorageError, setStorageLoading);
    refresh();
    window.addEventListener("jcoins:action-success", refresh);
    return () => window.removeEventListener("jcoins:action-success", refresh);
  }, []);
  const set = (group, key, value) => setSettings({ ...settings, [group]: { ...(settings[group] || {}), [key]: Number(value) || value } });
  const saveAll = () => run(() => put("/admin/settings", { settings }), "Settings saved");
  const guildSystem = data.guildSystem || {};
  const guildSubmitted = (guildSystem.students || []).filter((student) => student.submitted).length;
  const guildRevealed = (guildSystem.students || []).filter((student) => student.revealed).length;
  return <div className="dashboard-grid">
    <section className="panel wide settings-save-panel">
      <div className="section-head">
        <div>
          <div className="section-title">Settings</div>
          <p className="muted-line">Save all setting changes from one button.</p>
        </div>
        <button type="button" onClick={saveAll}>Save All Settings</button>
      </div>
    </section>
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
    </Panel>
    <Panel title="Wheel Settings" defaultOpen={false}>
      <Field label="Spin Duration Seconds" type="number" value={settings.wheel?.spinSeconds ?? 3.3} onChange={(v) => set("wheel", "spinSeconds", v)} />
      <p className="muted-line">Example: 3.3 is quick, 5 is dramatic, 8 is very suspenseful.</p>
    </Panel>
    <Panel title="Guild Settings" defaultOpen={false}>
      <Field label="Reveal Duration Seconds" type="number" value={settings.guild?.revealSeconds ?? 10} onChange={(v) => set("guild", "revealSeconds", v)} />
      <p className="muted-line">This controls how long the Sorting Ceremony shows traits before the guild appears.</p>
      <div className="metric-strip">
        <section className="metric-tile"><span>Status</span><strong>{guildStatusLabel(guildSystem.status)}</strong></section>
        <section className="metric-tile"><span>Submitted</span><strong>{guildSubmitted}</strong></section>
        <section className="metric-tile"><span>Revealed</span><strong>{guildRevealed}</strong></section>
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
    <Panel title="Student Registration" defaultOpen={false}>
      <Select label="Student Registration" value={settings.registration?.enabled ? "on" : "off"} onChange={(value) => setSettings({ ...settings, registration: { ...(settings.registration || {}), enabled: value === "on" } })} options={[{ value: "off", label: "Off" }, { value: "on", label: "On" }]} />
      <Field label="Registration Code" value={settings.registration?.code || ""} onChange={(code) => setSettings({ ...settings, registration: { ...(settings.registration || {}), code } })} />
      <p className="muted-line">Students need this code before they can create their account.</p>
    </Panel>
    <Panel title="Database & Backups" wide defaultOpen={false} actions={<button type="button" className="soft" disabled={storageLoading} onClick={() => loadStorageHealth(setStorageHealth, setStorageError, setStorageLoading)}>{storageLoading ? "Checking..." : "Refresh"}</button>}>
      {storageError && <div className="error">{storageError}</div>}
      {storageHealth && <>
        <div className="metric-strip">
          <section className="metric-tile"><span>Storage</span><strong>{storageHealth.storage === "supabase" ? "Supabase" : "Local"}</strong></section>
          <section className="metric-tile"><span>Integrity</span><strong>{storageHealth.healthy ? "Healthy" : "Check Required"}</strong></section>
          <section className="metric-tile"><span>Latest Backup</span><strong>{storageHealth.backup?.available ? storageHealth.backup.date : "Not Found"}</strong></section>
        </div>
        <p className="muted-line">{storageHealth.note}</p>
        <Table columns={["Data", "Stored Rows", "Visible Records", "Status"]} rows={(storageHealth.rows || []).map((row) => [
          row.label,
          row.rowCount,
          row.visibleCount,
          row.missingCount > 0 ? `Missing ${row.missingCount}` : row.rowCount > row.visibleCount ? `Retained +${row.rowCount - row.visibleCount}` : "OK"
        ])} />
      </>}
    </Panel>
    <Panel title="Ranks" wide defaultOpen={false}>
      <Table columns={["Rank", "Minimum"]} rows={settings.ranks.map((r, i) => [
        <input value={r.name} onChange={(e) => setSettings({ ...settings, ranks: settings.ranks.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} />,
        <input type="number" value={r.min} onChange={(e) => setSettings({ ...settings, ranks: settings.ranks.map((x, j) => j === i ? { ...x, min: Number(e.target.value) } : x) })} />
      ])} />
      <div className="button-row">
        <button className="soft" onClick={() => setSettings({ ...settings, ranks: [...settings.ranks, { name: "New Rank", min: 0 }] })}>Add Rank</button>
        <button onClick={saveAll}>Save All Settings</button>
      </div>
    </Panel>
  </div>;
}

async function loadStorageHealth(setHealth, setError, setLoading) {
  setLoading(true);
  setError("");
  try {
    setHealth(await request("/admin/storage-health"));
  } catch (error) {
    setError(error.message || "Could not check database health.");
  } finally {
    setLoading(false);
  }
}

function guildStatusLabel(status) {
  return {
    not_started: "Not Started",
    open: "Open",
    locked: "Locked",
    ceremony_active: "Ceremony Active"
  }[status] || "Not Started";
}
