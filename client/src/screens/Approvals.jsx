import React from "react";
import { post } from "../api.js";
import { DataTable } from "../components/ui.jsx";

export default function Approvals({ data, run }) {
  return <DataTable title="Requests / Notifications" defaultOpen columns={["Date", "Student", "Type", "Details", "Status", "Action"]} rows={data.requests.map((r) => [
    new Date(r.createdAt).toLocaleString(),
    r.studentName || "Student",
    r.type,
    requestDetails(r),
    r.status,
    r.status === "pending" ? <div className="inline">
      <button onClick={() => run(() => post(`/admin/requests/${r.id}/resolve`, { status: "approved" }), "Request approved")}>Approve</button>
      <button className="danger" onClick={() => run(() => post(`/admin/requests/${r.id}/resolve`, { status: "rejected" }), "Request rejected")}>Reject</button>
    </div> : r.type === "trade" && r.status === "peer_pending" ? "Waiting for student approval" : r.type === "registration" && r.status === "created" ? "No approval needed" : "Done"
  ])} />;
}

function requestDetails(request) {
  if (request.type === "registration") {
    const payload = request.payload || {};
    const subjects = (payload.subjectNames || payload.subjectIds || []).join(", ");
    return `${payload.username || "username"} | Section ${payload.section || "-"}${subjects ? ` | ${subjects}` : ""}`;
  }
  if (request.type === "purchase") return request.itemName || request.remarks || "Purchase request";
  if (request.type === "trade") return `${request.tradeSenderName || request.fromStudentName || "Student"} sends to ${request.tradeRecipientName || request.toStudentName || "student"} - ${request.payload?.amount || 0} JC${request.remarks ? ` - ${request.remarks}` : ""}`;
  return request.remarks || "";
}
