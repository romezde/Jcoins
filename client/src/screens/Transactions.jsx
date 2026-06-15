import React, { useState } from "react";
import { post } from "../api.js";
import { ActionModal, DropdownChecklist, Field, Panel, Select, Table } from "../components/ui.jsx";

export default function Transactions({ data, run }) {
  const [form, setForm] = useState({ recipientMode: "single", studentId: data.students[0]?.id || "", studentIds: [], type: "bonus", fromStudentId: "", itemId: "", amount: 10, remarks: "" });
  const [filter, setFilter] = useState({ type: "all", studentId: "all", search: "" });
  const typeOptions = ["bonus", "adjustment", "penalty", "trade", "shop"];
  const canBulk = form.type !== "trade";
  const filteredTransactions = data.transactions.filter((transaction) => {
    const typeMatch = filter.type === "all" || transaction.type === filter.type;
    const studentMatch = filter.studentId === "all" || transaction.studentId === filter.studentId;
    const q = filter.search.trim().toLowerCase();
    const searchMatch = !q || [transaction.studentName, transaction.type, transaction.amount, transaction.note, transaction.createdAt].some((value) => String(value || "").toLowerCase().includes(q));
    return typeMatch && studentMatch && searchMatch;
  });
  function submitTransaction(e) {
    e.preventDefault();
    const studentIds = form.type === "trade" || form.recipientMode === "single"
      ? [form.studentId].filter(Boolean)
      : form.recipientMode === "all"
        ? data.students.map((student) => student.id)
        : form.studentIds;
    run(() => post("/admin/transactions", { ...form, studentId: studentIds[0] || "", studentIds }), studentIds.length > 1 ? `${studentIds.length} transactions added` : "Transaction added");
  }
  return <div className="dashboard-grid">
    <ActionModal title="Add Transaction">
      <form onSubmit={submitTransaction}>
        <Select label="Type" value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={typeOptions} />
        {canBulk && <Select label="Recipients" value={form.recipientMode} onChange={(recipientMode) => setForm({ ...form, recipientMode })} options={[
          { value: "single", label: "One student" },
          { value: "selected", label: "Selected students" },
          { value: "all", label: `All students (${data.students.length})` }
        ]} />}
        {(!canBulk || form.recipientMode === "single") && <Select label="To Student" value={form.studentId} onChange={(v) => setForm({ ...form, studentId: v })} options={data.students} />}
        {canBulk && form.recipientMode === "selected" && <DropdownChecklist label="Select Students" items={data.students} selected={form.studentIds} onChange={(studentIds) => setForm({ ...form, studentIds })} />}
        {canBulk && form.recipientMode === "all" && <div className="notice">This will apply to all {data.students.length} students currently available to your account.</div>}
        {form.type === "trade" && <Select label="From Student" value={form.fromStudentId} onChange={(v) => setForm({ ...form, fromStudentId: v })} options={[{ id: "", name: "Select" }, ...data.students]} />}
        {form.type === "shop" && <Select label="Item" value={form.itemId} onChange={(v) => setForm({ ...form, itemId: v })} options={[{ id: "", name: "Select" }, ...data.shopItems.map((i) => ({ id: i.id, name: `${i.name} (${i.activeCost} JC)` }))]} />}
        <Field label="Amount" type="number" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
        <Field label="Remarks" value={form.remarks} onChange={(v) => setForm({ ...form, remarks: v })} />
        <button disabled={canBulk && form.recipientMode === "selected" && !form.studentIds.length}>Add Transaction</button>
      </form>
    </ActionModal>
    <Panel title="Transactions Table" wide defaultOpen>
      <div className="filter-bar transaction-filter-bar">
        <Select label="Type" value={filter.type} onChange={(type) => setFilter({ ...filter, type })} options={[{ value: "all", label: "All types" }, ...[...new Set(data.transactions.map((transaction) => transaction.type)), ...typeOptions].filter(Boolean).map((type) => ({ value: type, label: type }))]} />
        <Select label="Student" value={filter.studentId} onChange={(studentId) => setFilter({ ...filter, studentId })} options={[{ value: "all", label: "All students" }, ...data.students.map((student) => ({ value: student.id, label: student.name }))]} />
        <Field label="Search Transactions" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
        <div className="filter-count">{filteredTransactions.length} transaction{filteredTransactions.length === 1 ? "" : "s"}</div>
      </div>
      <Table columns={["Date", "Student", "Type", "Amount", "Remarks"]} rows={filteredTransactions.map((t) => [new Date(t.createdAt).toLocaleString(), t.studentName, t.type, t.amount, t.note])} />
    </Panel>
  </div>;
}
