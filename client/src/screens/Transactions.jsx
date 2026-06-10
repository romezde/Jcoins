import React, { useState } from "react";
import { post } from "../api.js";
import { ActionModal, Field, Panel, Select, Table } from "../components/ui.jsx";

export default function Transactions({ data, run }) {
  const [form, setForm] = useState({ studentId: data.students[0]?.id || "", type: "bonus", fromStudentId: "", itemId: "", amount: 10, remarks: "" });
  const [filter, setFilter] = useState({ type: "all", studentId: "all", search: "" });
  const typeOptions = ["bonus", "adjustment", "penalty", "trade", "shop"];
  const filteredTransactions = data.transactions.filter((transaction) => {
    const typeMatch = filter.type === "all" || transaction.type === filter.type;
    const studentMatch = filter.studentId === "all" || transaction.studentId === filter.studentId;
    const q = filter.search.trim().toLowerCase();
    const searchMatch = !q || [transaction.studentName, transaction.type, transaction.amount, transaction.note, transaction.createdAt].some((value) => String(value || "").toLowerCase().includes(q));
    return typeMatch && studentMatch && searchMatch;
  });
  return <div className="dashboard-grid">
    <ActionModal title="Add Transaction">
      <form onSubmit={(e) => { e.preventDefault(); run(() => post("/admin/transactions", form), "Transaction added"); }}>
        <Select label="To Student" value={form.studentId} onChange={(v) => setForm({ ...form, studentId: v })} options={data.students} />
        <Select label="Type" value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={typeOptions} />
        {form.type === "trade" && <Select label="From Student" value={form.fromStudentId} onChange={(v) => setForm({ ...form, fromStudentId: v })} options={[{ id: "", name: "Select" }, ...data.students]} />}
        {form.type === "shop" && <Select label="Item" value={form.itemId} onChange={(v) => setForm({ ...form, itemId: v })} options={[{ id: "", name: "Select" }, ...data.shopItems.map((i) => ({ id: i.id, name: `${i.name} (${i.activeCost} JC)` }))]} />}
        <Field label="Amount" type="number" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
        <Field label="Remarks" value={form.remarks} onChange={(v) => setForm({ ...form, remarks: v })} />
        <button>Add Transaction</button>
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
