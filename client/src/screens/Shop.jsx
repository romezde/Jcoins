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
  return <Panel title="Shop Items" wide defaultOpen>
    <ShopFilters filter={filter} setFilter={setFilter} count={filteredItems.length} />
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
              <button onClick={() => run(() => post("/requests", { type: "purchase", payload: { itemId: item.id }, remarks: `Buy ${item.name}` }), "Purchase requested")}>Request Buy</button>
            </article>)}
          </div>
        </section>;
      })}
      {!filteredItems.length && <div className="empty-card">No shop items match this search.</div>}
    </div>
  </Panel>;
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
