import React, { useEffect, useState } from "react";
import { put } from "../api.js";
import { Field, Panel, Table } from "../components/ui.jsx";

export default function Settings({ data, run }) {
  const [settings, setSettings] = useState(data.settings);
  useEffect(() => setSettings(data.settings), [data.settings]);
  const set = (group, key, value) => setSettings({ ...settings, [group]: { ...settings[group], [key]: Number(value) || value } });
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
