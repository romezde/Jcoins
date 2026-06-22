import React, { useState } from "react";
import { Field, Panel, Select, Table } from "../components/ui.jsx";

export default function AuditLogs({ data }) {
  const [filter, setFilter] = useState({ action: "all", actor: "all", search: "" });
  const logs = data.auditLogs || [];
  const actions = [...new Set(logs.map((log) => log.action).filter(Boolean))].sort();
  const actors = [...new Set(logs.map((log) => log.actorName || log.actorId).filter(Boolean))].sort();
  const q = filter.search.trim().toLowerCase();
  const rows = logs.filter((log) => {
    const actionMatch = filter.action === "all" || log.action === filter.action;
    const actorMatch = filter.actor === "all" || (log.actorName || log.actorId) === filter.actor;
    const searchMatch = !q || [log.action, log.actorName, log.targetStudentName, log.summary, log.entityType, log.amount, log.createdAt].some((value) => String(value || "").toLowerCase().includes(q));
    return actionMatch && actorMatch && searchMatch;
  });

  return <Panel title="System History" wide defaultOpen>
    <div className="filter-bar">
      <Select label="Action" value={filter.action} onChange={(action) => setFilter({ ...filter, action })} options={[{ value: "all", label: "All actions" }, ...actions.map((action) => ({ value: action, label: formatAction(action) }))]} />
      <Select label="Actor" value={filter.actor} onChange={(actor) => setFilter({ ...filter, actor })} options={[{ value: "all", label: "All users" }, ...actors.map((actor) => ({ value: actor, label: actor }))]} />
      <Field label="Search History" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
      <div className="filter-count">{rows.length} log{rows.length === 1 ? "" : "s"}</div>
    </div>
    <Table columns={["Date", "Actor", "Action", "Student", "Amount", "Summary"]} rows={rows.map((log) => [
      new Date(log.createdAt).toLocaleString(),
      log.actorName || log.actorId || "system",
      formatAction(log.action),
      log.targetStudentName || "-",
      log.amount === "" ? "-" : log.amount,
      log.summary || ""
    ])} pageSize={15} />
  </Panel>;
}

function formatAction(action) {
  return String(action || "Change").split(/[._-]/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
