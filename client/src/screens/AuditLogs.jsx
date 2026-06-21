import React, { useState } from "react";
import { Field, Panel, Select, Table } from "../components/ui.jsx";

export default function AuditLogs({ data }) {
  const [filter, setFilter] = useState({ action: "all", search: "" });
  const logs = data.auditLogs || [];
  const actions = [...new Set(logs.map((log) => log.action).filter(Boolean))].sort();
  const q = filter.search.trim().toLowerCase();
  const rows = logs.filter((log) => {
    const actionMatch = filter.action === "all" || log.action === filter.action;
    const searchMatch = !q || [log.action, log.actorName, log.targetStudentName, log.summary, log.entityType, log.amount, log.createdAt].some((value) => String(value || "").toLowerCase().includes(q));
    return actionMatch && searchMatch;
  });

  return <Panel title="Audit Logs" wide defaultOpen>
    <div className="filter-bar">
      <Select label="Action" value={filter.action} onChange={(action) => setFilter({ ...filter, action })} options={[{ value: "all", label: "All actions" }, ...actions.map((action) => ({ value: action, label: action }))]} />
      <Field label="Search Audit Logs" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
      <div className="filter-count">{rows.length} log{rows.length === 1 ? "" : "s"}</div>
    </div>
    <Table columns={["Date", "Actor", "Action", "Student", "Amount", "Summary"]} rows={rows.map((log) => [
      new Date(log.createdAt).toLocaleString(),
      log.actorName || log.actorId || "system",
      log.action,
      log.targetStudentName || "-",
      log.amount === "" ? "-" : log.amount,
      log.summary || ""
    ])} pageSize={15} />
  </Panel>;
}
