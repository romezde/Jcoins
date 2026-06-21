import React, { useEffect, useState } from "react";
import { del, post, put } from "../api.js";
import { ActionModal, Checklist, DataTable, Field, Panel, Select, Table } from "../components/ui.jsx";

const tierOptions = ["Low", "Mid", "High", "Premium"];

export default function Shop({ data, run }) {
  const [item, setItem] = useState({ name: "", cost: 0, tier: "Low", notes: "" });
  const [sale, setSale] = useState({ name: "Sale", startDate: "", endDate: "", discount: 10, itemIds: data.shopItems.map((shopItem) => shopItem.id) });

  useEffect(() => {
    setSale((current) => current.itemIds.length ? current : { ...current, itemIds: data.shopItems.map((shopItem) => shopItem.id) });
  }, [data.shopItems]);

  return <div className="dashboard-grid">
    <ActionModal title="Add Shop Item">
      <form onSubmit={(e) => { e.preventDefault(); run(() => post("/admin/shop/items", item), "Item added"); }}>
        <Field label="Name" value={item.name} onChange={(v) => setItem({ ...item, name: v })} />
        <Field label="Cost" type="number" value={item.cost} onChange={(v) => setItem({ ...item, cost: v })} />
        <Select label="Tier" value={item.tier} onChange={(v) => setItem({ ...item, tier: v })} options={tierOptions} />
        <Field label="Notes" value={item.notes} onChange={(v) => setItem({ ...item, notes: v })} />
        <button>Add Item</button>
      </form>
    </ActionModal>
    <ActionModal title="Add Sale">
      <form onSubmit={(e) => { e.preventDefault(); run(() => post("/admin/shop/sales", sale), "Sale added"); }}>
        <Field label="Sale Name" value={sale.name} onChange={(v) => setSale({ ...sale, name: v })} />
        <Field label="Start Date" type="date" value={sale.startDate} onChange={(v) => setSale({ ...sale, startDate: v })} />
        <Field label="End Date" type="date" value={sale.endDate} onChange={(v) => setSale({ ...sale, endDate: v })} />
        <Field label="Discount %" type="number" value={sale.discount} onChange={(v) => setSale({ ...sale, discount: v })} />
        <Checklist title="Items" items={data.shopItems} selected={sale.itemIds} onChange={(ids) => setSale({ ...sale, itemIds: ids })} />
        <button>Add Sale</button>
      </form>
    </ActionModal>
    <ShopItemsTable items={data.shopItems} run={run} />
    <DataTable title="Sales" columns={["Name", "Dates", "Discount", "Items"]} rows={data.sales.map((s) => [s.name, `${s.startDate} to ${s.endDate}`, `${s.discount}%`, s.itemIds.length])} />
  </div>;
}

function ShopItemsTable({ items, run }) {
  const [edits, setEdits] = useState({});
  const [filter, setFilter] = useState({ tier: "all", search: "" });
  const filteredItems = filterShopItems(items, filter);
  const tiers = [...new Set([...tierOptions, ...filteredItems.map((item) => item.tier || "Low")])];
  const rows = tiers.flatMap((tier) => {
    const tierItems = filteredItems.filter((item) => (item.tier || "Low") === tier);
    if (!tierItems.length) return [];
    return [
      [<strong className="tier-label">{tier}</strong>, "", "", "", "", ""],
      ...tierItems.map((item) => {
        const edit = edits[item.id] || item;
        return [
        <input value={edit.name} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, name: e.target.value } })} />,
        <input type="number" value={edit.cost} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, cost: e.target.value } })} />,
        item.activeCost,
        `${item.discount}%`,
        <input value={edit.notes || ""} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, notes: e.target.value } })} />,
        <div className="inline">
          <select value={edit.tier || "Low"} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, tier: e.target.value } })}>{tierOptions.map((option) => <option key={option}>{option}</option>)}</select>
          <button onClick={() => run(() => put(`/admin/shop/items/${item.id}`, edit), "Item saved")}>Save</button>
          <button className="danger" onClick={() => confirm(`Delete ${item.name}?`) && run(() => del(`/admin/shop/items/${item.id}`), "Item deleted")}>Delete</button>
        </div>
      ];})
    ];
  });
  return <Panel title="Shop Items by Tier" wide defaultOpen>
    <ShopFilters filter={filter} setFilter={setFilter} count={filteredItems.length} />
    <Table columns={["Item", "Base", "Active", "Discount", "Notes", "Actions"]} rows={rows} />
  </Panel>;
}

export function StudentShop({ data, run }) {
  const [filter, setFilter] = useState({ tier: "all", search: "" });
  const filteredItems = filterShopItems(data.shopItems, filter);
  const tiers = [...new Set([...tierOptions, ...filteredItems.map((item) => item.tier || "Low")])];
  const purchaseRequests = requestList(data, "purchase");
  const pendingPurchase = purchaseRequests.find((request) => request.status === "pending");
  const latestPurchase = purchaseRequests[0];
  return <div className="dashboard-grid">
    <section className="panel wide request-summary-panel">
      <div className="section-title">Latest Shop Request</div>
      {pendingPurchase ? <RequestCard request={pendingPurchase} run={run} actionLabel="Cancel Request" /> : latestPurchase ? <RequestCard request={latestPurchase} run={run} /> : <div className="empty-card">No shop request yet. Choose an item below when you are ready.</div>}
    </section>
    <Panel title="Shop Items" wide defaultOpen>
      <ShopFilters filter={filter} setFilter={setFilter} count={filteredItems.length} />
      {pendingPurchase && <p className="muted-line">You already have one pending shop request. Cancel it before requesting another item.</p>}
      <div className="shop-card-groups">
        {tiers.map((tier) => {
          const tierItems = filteredItems.filter((item) => (item.tier || "Low") === tier);
          if (!tierItems.length) return null;
          return <section key={tier} className="shop-card-group">
            <h3>{tier} <span>{tierItems.length}</span></h3>
            <div className="shop-card-grid">
              {tierItems.map((item) => <article key={item.id} className="shop-card">
                <div className="shop-card-top">
                  <strong>{item.name}</strong>
                  <span>{Number(item.activeCost || 0).toLocaleString()} JC</span>
                </div>
                {item.discount > 0 && <div className="sale-pill">-{item.discount}% sale</div>}
                {item.notes && <p>{item.notes}</p>}
                <button disabled={!!pendingPurchase} onClick={() => run(() => post("/requests", { type: "purchase", payload: { itemId: item.id }, remarks: `Buy ${item.name}` }), "Purchase requested")}>Request Buy</button>
              </article>)}
            </div>
          </section>;
        })}
        {!filteredItems.length && <div className="empty-card">No shop items match this search.</div>}
      </div>
    </Panel>
  </div>;
}

export function StudentTradeRequests({ data, run }) {
  const recipients = (data.students || []).filter((student) => student.id !== data.student?.id);
  const [form, setForm] = useState({ toStudentId: recipients[0]?.id || "", requesterRole: "sender", amount: 1, remarks: "" });
  const tradeRequests = requestList(data, "trade");
  const currentStudentId = data.student?.id;
  const activeStatuses = ["peer_pending", "pending"];
  const activeTrade = tradeRequests.find((request) => activeStatuses.includes(request.status));
  const incomingTrades = tradeRequests.filter((request) => request.status === "peer_pending" && request.payload?.toStudentId === currentStudentId);
  const outgoingPeer = tradeRequests.filter((request) => request.status === "peer_pending" && request.studentId === currentStudentId);
  const waitingAdmin = tradeRequests.filter((request) => request.status === "pending");
  const recentDone = tradeRequests.filter((request) => !activeStatuses.includes(request.status)).slice(0, 10);
  const selectedRecipient = recipients.some((student) => student.id === form.toStudentId) ? form.toStudentId : recipients[0]?.id || "";

  return <div className="dashboard-grid">
    <section className="panel wide request-summary-panel">
      <div className="section-title">Trade Requests Waiting For You</div>
      {incomingTrades.length ? incomingTrades.map((request) => <RequestCard key={request.id} request={request} run={run} studentId={currentStudentId} peerActions />) : <div className="empty-card">No trade request needs your approval.</div>}
    </section>
    <section className="panel wide request-summary-panel">
      <div className="section-title">Waiting For Other Student</div>
      {outgoingPeer.length ? outgoingPeer.map((request) => <RequestCard key={request.id} request={request} run={run} studentId={currentStudentId} actionLabel="Cancel Request" />) : <div className="empty-card">No trade request is waiting for another student.</div>}
    </section>
    <section className="panel wide request-summary-panel">
      <div className="section-title">Waiting For Admin Approval</div>
      {waitingAdmin.length ? waitingAdmin.map((request) => <RequestCard key={request.id} request={request} run={run} studentId={currentStudentId} actionLabel={request.studentId === currentStudentId ? "Cancel Request" : ""} />) : <div className="empty-card">No trade request is waiting for admin approval.</div>}
    </section>
    <section className="panel">
      <div className="section-title">Request Trade</div>
      <form onSubmit={(e) => {
        e.preventDefault();
        run(() => post("/requests", {
          type: "trade",
          payload: { toStudentId: selectedRecipient, requesterRole: form.requesterRole, amount: Number(form.amount || 0) },
          remarks: form.remarks || `Trade ${form.amount} JCoins`
        }), "Trade requested");
      }}>
        <Select label="Trade With" value={selectedRecipient} onChange={(toStudentId) => setForm({ ...form, toStudentId })} options={recipients.map((student) => ({ value: student.id, label: `${student.name}${student.section ? ` - ${student.section}` : ""}` }))} />
        <Select label="Trade Role" value={form.requesterRole} onChange={(requesterRole) => setForm({ ...form, requesterRole })} options={[
          { value: "sender", label: "I will send JCoins" },
          { value: "recipient", label: "I will receive JCoins" }
        ]} />
        <Field label="Amount" type="number" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} />
        <Field label="Remarks" value={form.remarks} onChange={(remarks) => setForm({ ...form, remarks })} />
        {activeTrade && <p className="muted-line">You are already involved in an active trade request. Finish or cancel it before making another.</p>}
        <button disabled={!!activeTrade || !selectedRecipient}>Send Trade Request</button>
      </form>
    </section>
    <Panel title="Recent Trade Requests Done" wide defaultOpen>
      <Table columns={["Date", "Trade", "Amount", "Status", "Remarks"]} rows={recentDone.map((request) => [
        new Date(request.createdAt).toLocaleString(),
        tradeSummary(request, currentStudentId),
        request.payload?.amount || "",
        request.status,
        request.remarks || ""
      ])} />
    </Panel>
  </div>;
}

function RequestCard({ request, run, actionLabel = "", studentId = "", peerActions = false }) {
  const item = request.type === "purchase" ? request.itemName || "Unknown item" : request.type === "trade" ? tradeSummary(request, studentId) : request.type;
  const amount = request.type === "trade" ? `${Number(request.payload?.amount || 0).toLocaleString()} JC` : "";
  return <article className={`request-card request-${request.status}`}>
    <div>
      <span className="request-status">{request.status}</span>
      <strong>{item}</strong>
      {amount && <p>{amount}</p>}
      {request.remarks && <p>{request.remarks}</p>}
      <small>{new Date(request.createdAt).toLocaleString()}</small>
    </div>
    {peerActions && <div className="inline">
      <button onClick={() => run(() => post(`/requests/${request.id}/respond`, { status: "approved" }), "Trade accepted")}>Accept</button>
      <button className="danger" onClick={() => run(() => post(`/requests/${request.id}/respond`, { status: "rejected" }), "Trade rejected")}>Reject</button>
    </div>}
    {request.status === "pending" && actionLabel && <button className="danger" onClick={() => run(() => post(`/requests/${request.id}/cancel`, {}), "Request cancelled")}>{actionLabel}</button>}
    {request.status === "peer_pending" && actionLabel && <button className="danger" onClick={() => run(() => post(`/requests/${request.id}/cancel`, {}), "Request cancelled")}>{actionLabel}</button>}
  </article>;
}

function requestList(data, type) {
  return (data.requests || []).filter((request) => request.type === type).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function tradeSummary(request, studentId = "") {
  const sender = request.tradeSenderName || request.fromStudentName || "Student";
  const recipient = request.tradeRecipientName || request.toStudentName || "Student";
  if (studentId && request.payload?.requesterRole === "sender" && request.studentId === studentId) return `You send to ${recipient}`;
  if (studentId && request.payload?.requesterRole === "recipient" && request.studentId === studentId) return `You receive from ${sender}`;
  if (studentId && request.payload?.toStudentId === studentId) return request.payload?.requesterRole === "recipient" ? `You send to ${recipient}` : `You receive from ${sender}`;
  return `${sender} -> ${recipient}`;
}
function ShopFilters({ filter, setFilter, count }) {
  return <div className="filter-bar">
    <Select label="Tier" value={filter.tier} onChange={(tier) => setFilter({ ...filter, tier })} options={[{ value: "all", label: "All tiers" }, ...tierOptions.map((tier) => ({ value: tier, label: tier }))]} />
    <Field label="Search Shop" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
    <div className="filter-count">{count} item{count === 1 ? "" : "s"}</div>
  </div>;
}

function filterShopItems(items, filter) {
  const q = filter.search.trim().toLowerCase();
  return items.filter((item) => {
    const tierMatch = filter.tier === "all" || (item.tier || "Low") === filter.tier;
    const searchMatch = !q || [item.name, item.tier, item.cost, item.activeCost, item.notes].some((value) => String(value || "").toLowerCase().includes(q));
    return tierMatch && searchMatch;
  });
}
