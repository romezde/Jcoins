import React, { useState } from "react";
import { post } from "../api.js";
import { StudentFilterFields, StudentMultiPicker, studentMatchesFilters } from "../components/StudentMultiPicker.jsx";
import { ActionModal, Field, Panel, Select, Table } from "../components/ui.jsx";

export default function Transactions({ data, run, role }) {
  const [form, setForm] = useState({ recipientMode: "selected", studentId: "", studentIds: [], type: "bonus", fromStudentId: "", itemId: "", amount: 10, remarks: "" });
  const [targetFilter, setTargetFilter] = useState({ search: "", subjectId: "all", section: "all", guildId: "all" });
  const [filter, setFilter] = useState({ type: "all", studentId: "all", subjectId: "all", section: "all", guildId: "all", search: "" });
  const typeOptions = role === "student" ? ["bonus", "adjustment", "penalty"] : ["bonus", "adjustment", "penalty", "trade", "shop"];
  const canBulk = form.type !== "trade";
  const studentById = new Map(data.students.map((student) => [student.id, student]));
  const filteredTargetStudents = data.students.filter((student) => studentMatchesFilters(data, student, targetFilter));
  const tradeNeedsOneRecipient = form.type === "trade" && form.studentIds.length !== 1;
  const selectedNeedsRecipient = canBulk && form.recipientMode === "selected" && !form.studentIds.length;
  const filteredNeedsRecipient = canBulk && form.recipientMode === "filtered" && !filteredTargetStudents.length;
  const filteredTransactions = data.transactions.filter((transaction) => {
    const typeMatch = filter.type === "all" || transaction.type === filter.type;
    const studentMatch = filter.studentId === "all" || transaction.studentId === filter.studentId;
    const targetMatch = studentMatchesFilters(data, studentById.get(transaction.studentId), filter, { includeSearch: false });
    const q = filter.search.trim().toLowerCase();
    const searchMatch = !q || [transaction.studentName, transaction.type, transaction.amount, transaction.note, transaction.createdAt].some((value) => String(value || "").toLowerCase().includes(q));
    return typeMatch && studentMatch && targetMatch && searchMatch;
  });
  function submitTransaction(e) {
    e.preventDefault();
    const studentIds = form.type === "trade"
      ? form.studentIds
      : form.recipientMode === "all"
        ? data.students.map((student) => student.id)
        : form.recipientMode === "filtered"
          ? filteredTargetStudents.map((student) => student.id)
        : form.studentIds;
    run(() => post("/admin/transactions", { ...form, studentId: studentIds[0] || "", studentIds }), studentIds.length > 1 ? `${studentIds.length} transactions added` : "Transaction added");
  }
  return <div className="dashboard-grid">
    <ActionModal title="Add Transaction">
      <form onSubmit={submitTransaction}>
        <Select label="Type" value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={typeOptions} />
        {canBulk && <Select label="Recipients" value={form.recipientMode} onChange={(recipientMode) => setForm({ ...form, recipientMode })} options={[
          { value: "selected", label: "Selected students" },
          { value: "filtered", label: "Filtered group" },
          { value: "all", label: `All students (${data.students.length})` }
        ]} />}
        {!canBulk && <StudentMultiPicker data={data} students={data.students} selected={form.studentIds} onChange={(studentIds) => setForm({ ...form, studentIds })} label="To Student" />}
        {!canBulk && <div className="notice">Choose exactly one student for trade transactions.</div>}
        {canBulk && form.recipientMode === "selected" && <StudentMultiPicker data={data} students={data.students} selected={form.studentIds} onChange={(studentIds) => setForm({ ...form, studentIds })} />}
        {canBulk && form.recipientMode === "filtered" && <FilteredRecipients data={data} filter={targetFilter} setFilter={setTargetFilter} students={filteredTargetStudents} />}
        {canBulk && form.recipientMode === "all" && <div className="notice">This will apply to all {data.students.length} students currently available to your account.</div>}
        {form.type === "trade" && <Select label="From Student" value={form.fromStudentId} onChange={(v) => setForm({ ...form, fromStudentId: v })} options={[{ id: "", name: "Select" }, ...data.students]} />}
        {form.type === "shop" && <Select label="Item" value={form.itemId} onChange={(v) => setForm({ ...form, itemId: v })} options={[{ id: "", name: "Select" }, ...data.shopItems.map((i) => ({ id: i.id, name: `${i.name} (${i.activeCost} JC)` }))]} />}
        <Field label="Amount" type="number" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
        <Field label="Remarks" value={form.remarks} onChange={(v) => setForm({ ...form, remarks: v })} />
        <button disabled={tradeNeedsOneRecipient || selectedNeedsRecipient || filteredNeedsRecipient}>Add Transaction</button>
      </form>
    </ActionModal>
    <Panel title="Transactions Table" wide defaultOpen>
      <div className="filter-bar transaction-filter-bar">
        <Select label="Type" value={filter.type} onChange={(type) => setFilter({ ...filter, type })} options={[{ value: "all", label: "All types" }, ...[...new Set(data.transactions.map((transaction) => transaction.type)), ...typeOptions].filter(Boolean).map((type) => ({ value: type, label: type }))]} />
        <Select label="Student" value={filter.studentId} onChange={(studentId) => setFilter({ ...filter, studentId })} options={[{ value: "all", label: "All students" }, ...data.students.map((student) => ({ value: student.id, label: student.name }))]} />
        <StudentFilterFields data={data} filter={filter} setFilter={setFilter} showSearch={false} />
        <Field label="Search Transactions" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
        <div className="filter-count">{filteredTransactions.length} transaction{filteredTransactions.length === 1 ? "" : "s"}</div>
      </div>
      <Table columns={["Date", "Student", "Type", "Amount", "Remarks"]} rows={filteredTransactions.map((t) => [new Date(t.createdAt).toLocaleString(), t.studentName, t.type, t.amount, t.note])} />
    </Panel>
  </div>;
}

function FilteredRecipients({ data, filter, setFilter, students }) {
  return <section className="transaction-target-box">
    <div className="form-grid two">
      <StudentFilterFields data={data} filter={filter} setFilter={setFilter} />
    </div>
    <div className="notice">This will apply to {students.length} matching student{students.length === 1 ? "" : "s"}.</div>
    {students.length > 0 && <p className="muted-line transaction-target-preview">{students.slice(0, 8).map((student) => student.name).join(", ")}{students.length > 8 ? `, and ${students.length - 8} more` : ""}</p>}
  </section>;
}
