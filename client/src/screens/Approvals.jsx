import React from "react";
import { post } from "../api.js";
import { DataTable } from "../components/ui.jsx";

export default function Approvals({ data, run }) {
  return <DataTable title="Requests / Notifications" defaultOpen columns={["Date", "Type", "Status", "Remarks", "Action"]} rows={data.requests.map((r) => [
    new Date(r.createdAt).toLocaleString(),
    r.type,
    r.status,
    r.remarks,
    r.status === "pending" ? <button onClick={() => run(() => post(`/admin/requests/${r.id}/resolve`, { status: "approved" }), "Request approved")}>Approve</button> : "Done"
  ])} />;
}
