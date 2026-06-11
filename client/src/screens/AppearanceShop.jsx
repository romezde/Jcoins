import React, { useState } from "react";
import { post, put } from "../api.js";
import CosmeticFx from "../components/CosmeticFx.jsx";
import { ActionModal, DataTable, Field, Panel, Select, Table } from "../components/ui.jsx";

const appearanceTypes = ["background", "border", "nameColor", "nameFont", "effect", "badge", "avatarFrame", "avatarIcon"];
const appearanceTiers = ["Common", "Rare", "Epic", "Legendary"];
const stylePresets = [
  "ap-name-blue",
  "ap-name-lime",
  "ap-name-gold",
  "ap-name-rainbow",
  "ap-name-rose",
  "ap-name-violet",
  "ap-name-ice",
  "ap-name-emerald",
  "ap-name-shadow",
  "ap-font-pixel",
  "ap-font-serif",
  "ap-font-round",
  "ap-font-comic",
  "ap-font-typewriter",
  "ap-font-fantasy",
  "ap-font-stencil",
  "ap-font-marker",
  "ap-bg-purple",
  "ap-bg-galaxy",
  "ap-bg-aurora",
  "ap-bg-ocean",
  "ap-bg-night-city",
  "ap-border-bronze",
  "ap-border-neon",
  "ap-border-flame",
  "ap-border-fire",
  "ap-border-dash",
  "ap-border-spike",
  "ap-border-ribbon",
  "ap-border-string",
  "ap-border-royal",
  "ap-avatar-neon",
  "ap-avatar-dragon",
  "ap-avatar-orbit",
  "ap-avatar-crystal",
  "ap-avatar-rune",
  "ap-icon-star",
  "ap-icon-crown",
  "ap-icon-bolt",
  "ap-icon-rocket",
  "ap-icon-heart",
  "ap-icon-diamond",
  "ap-icon-gamepad",
  "ap-icon-moon",
  "ap-effect-spark",
  "ap-effect-lightning",
  "ap-effect-glitch",
  "ap-effect-spotlight",
  "ap-effect-champion",
  "ap-badge-grinder",
  "ap-badge-slayer",
  "ap-badge-legend",
  "ap-badge-math-mage",
  "ap-badge-science-hero",
  "ap-badge-attendance-ace",
  "ap-badge-top-trader",
  "ap-badge-boss"
];

export default function AppearanceShop({ data, run }) {
  const [item, setItem] = useState({ name: "", type: "badge", price: 25, tier: "Common", preview: "", icon: "", active: true, styleClass: "ap-badge-grinder" });
  return <div className="dashboard-grid">
    <ActionModal title="Add Appearance Item">
      <form onSubmit={(e) => { e.preventDefault(); run(() => post("/admin/appearance/items", item), "Appearance item added"); }}>
        <Field label="Name" value={item.name} onChange={(v) => setItem({ ...item, name: v })} />
        <Select label="Type" value={item.type} onChange={(v) => setItem({ ...item, type: v })} options={appearanceTypes} />
        <Field label="Price" type="number" value={item.price} onChange={(v) => setItem({ ...item, price: v })} />
        <Select label="Tier" value={item.tier} onChange={(v) => setItem({ ...item, tier: v })} options={appearanceTiers} />
        <Select label="Style Preset" value={item.styleClass} onChange={(v) => setItem({ ...item, styleClass: v })} options={stylePresets} />
        <Field label="Preview Text" value={item.preview} onChange={(v) => setItem({ ...item, preview: v })} />
        <Field label="Avatar Icon" value={item.icon || ""} onChange={(v) => setItem({ ...item, icon: v })} />
        <label className="check"><input type="checkbox" checked={item.active} onChange={(e) => setItem({ ...item, active: e.target.checked })} />Active</label>
        <AppearancePreview item={item} />
        <button>Add Cosmetic</button>
      </form>
    </ActionModal>
    <AdminGrantAppearance data={data} run={run} />
    <AdminAppearanceItems items={data.appearanceItems || []} run={run} />
    <DataTable title="All Appearance Gifts" columns={["Date", "Item", "From", "To", "Message", "Price"]} rows={(data.appearanceGifts || []).map((gift) => [
      new Date(gift.createdAt).toLocaleString(),
      gift.itemName,
      gift.fromStudentName,
      gift.toStudentName,
      gift.message,
      gift.pricePaid
    ])} />
  </div>;
}

function AdminGrantAppearance({ data, run }) {
  const items = (data.appearanceItems || []).filter((item) => item.active !== false);
  const students = data.students || [];
  const [grant, setGrant] = useState({ itemId: items[0]?.id || "", studentId: students[0]?.id || "", allStudents: true, autoEquip: true, note: "" });
  const selectedItem = items.find((item) => item.id === grant.itemId) || items[0];
  const studentOptions = students.map((student) => ({ value: student.id, label: student.name + (student.section ? " - " + student.section : "") }));
  return <ActionModal title="Give Appearance Accessory" buttonLabel="Give Accessory">
    <form onSubmit={(e) => {
      e.preventDefault();
      run(() => post("/admin/appearance/grants", {
        itemId: grant.itemId || selectedItem?.id,
        allStudents: grant.allStudents,
        studentIds: grant.allStudents ? [] : [grant.studentId],
        autoEquip: grant.autoEquip,
        note: grant.note
      }), "Accessory granted");
    }}>
      <Select label="Accessory" value={grant.itemId || selectedItem?.id || ""} onChange={(itemId) => setGrant({ ...grant, itemId })} options={items.map((item) => ({ value: item.id, label: item.name + " (" + item.type + ")" }))} />
      <label className="check"><input type="checkbox" checked={grant.allStudents} onChange={(e) => setGrant({ ...grant, allStudents: e.target.checked })} />Give to all students</label>
      {!grant.allStudents && <Select label="Student" value={grant.studentId} onChange={(studentId) => setGrant({ ...grant, studentId })} options={studentOptions} />}
      <label className="check"><input type="checkbox" checked={grant.autoEquip} onChange={(e) => setGrant({ ...grant, autoEquip: e.target.checked })} />Auto equip after granting</label>
      <Field label="Event Note" value={grant.note} onChange={(note) => setGrant({ ...grant, note })} />
      {selectedItem && <AppearancePreview item={selectedItem} />}
      <button>Grant Accessory</button>
    </form>
  </ActionModal>;
}

function AdminAppearanceItems({ items, run }) {
  const [edits, setEdits] = useState({});
  const [filter, setFilter] = useState({ tier: "all", type: "all", search: "" });
  const filtered = filterAppearanceItems(items, filter);
  const rows = filtered.map((item) => {
    const edit = edits[item.id] || item;
    return [
      <input value={edit.name} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, name: e.target.value } })} />,
      <select value={edit.type} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, type: e.target.value } })}>{appearanceTypes.map((type) => <option key={type}>{type}</option>)}</select>,
      <input type="number" value={edit.price} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, price: e.target.value } })} />,
      <select value={edit.tier} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, tier: e.target.value } })}>{appearanceTiers.map((tier) => <option key={tier}>{tier}</option>)}</select>,
      <input value={edit.icon || ""} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, icon: e.target.value } })} />,
      <select value={edit.styleClass} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, styleClass: e.target.value } })}>{stylePresets.map((preset) => <option key={preset}>{preset}</option>)}</select>,
      <label className="check"><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, active: e.target.checked } })} />Active</label>,
      <div className="inline"><AppearancePreview item={edit} compact /><button onClick={() => run(() => put(`/admin/appearance/items/${item.id}`, edit), "Appearance saved")}>Save</button></div>
    ];
  });
  return <Panel title="Appearance Items" wide defaultOpen>
    <AppearanceFilters filter={filter} setFilter={setFilter} count={filtered.length} />
    <Table columns={["Name", "Type", "Price", "Tier", "Icon", "Style", "Active", "Preview / Action"]} rows={rows} />
  </Panel>;
}

export function StudentAppearanceShop({ data, run }) {
  const [activeTab, setActiveTab] = useState("shop");
  const [filter, setFilter] = useState({ tier: "all", type: "all", search: "" });
  const [gift, setGift] = useState({ itemId: "", toStudentId: "", message: "" });
  const ownedIds = new Set((data.appearanceInventory || []).map((entry) => entry.itemId));
  const equipped = data.student?.appearance?.equipped && typeof data.student.appearance.equipped === "object" ? data.student.appearance.equipped : {};
  const activeItems = (data.appearanceItems || []).filter((item) => item.active !== false);
  const shopItems = activeItems.filter((item) => !ownedIds.has(item.id));
  const filtered = filterAppearanceItems(shopItems, filter);
  const recipients = (data.students || []).filter((student) => student.id !== data.student?.id);
  const giftItem = activeItems.find((item) => item.id === gift.itemId) || filtered[0] || activeItems[0];
  const renderShopItem = (item) => {
    const owned = ownedIds.has(item.id);
    const isEquipped = String(equipped[item.type] || "") === String(item.id);
    return <CosmeticCard
      key={item.id}
      item={item}
      meta={`${item.tier} • ${Number(item.price || 0).toLocaleString()} JC`}
      note={item.preview || item.name}
      actions={<>
        {owned ? <>
          <button className={isEquipped ? "soft" : ""} disabled={isEquipped} onClick={() => run(() => post("/appearance/equip", { itemId: item.id }), "Equipped")}>{isEquipped ? "Equipped" : "Equip"}</button>
          {isEquipped && <button className="soft" onClick={() => run(() => post("/appearance/unequip", { type: item.type }), "Unequipped")}>Unequip</button>}
        </> : <button onClick={() => run(() => post("/appearance/buy", { itemId: item.id }), "Bought and equipped")}>Buy</button>}
        <button className="soft" onClick={() => { setGift({ ...gift, itemId: item.id }); setActiveTab("gifts"); }}>Gift</button>
      </>}
    />;
  };
  return <div className="dashboard-grid">
    <Panel title="Appearance Shop" wide defaultOpen>
      <div className="tabs appearance-tabs">
        <button className={activeTab === "shop" ? "active" : ""} onClick={() => setActiveTab("shop")}>Shop</button>
        <button className={activeTab === "inventory" ? "active" : ""} onClick={() => setActiveTab("inventory")}>Inventory</button>
        <button className={activeTab === "gifts" ? "active" : ""} onClick={() => setActiveTab("gifts")}>Gifts</button>
      </div>
      {activeTab === "shop" && <>
        <AppearanceFilters filter={filter} setFilter={setFilter} count={filtered.length} />
        <GroupedAppearanceTables
          items={filtered}
          renderItem={renderShopItem}
          emptyText="No cosmetics match this search."
        />
      </>}
      {activeTab === "inventory" && <OwnedAppearance data={data} run={run} embedded />}
      {activeTab === "gifts" && <GiftPanel gift={gift} setGift={setGift} giftItem={giftItem} activeItems={activeItems} recipients={recipients} gifts={data.appearanceGifts || []} studentId={data.student?.id} run={run} />}
    </Panel>
  </div>;
}

function GiftPanel({ gift, setGift, giftItem, activeItems, recipients, gifts, studentId, run }) {
  return <div className="stacked-panel">
    <form onSubmit={(e) => { e.preventDefault(); run(() => post("/appearance/gift", { ...gift, itemId: gift.itemId || giftItem?.id }), "Gift sent"); }}>
      <Select label="Item" value={gift.itemId || giftItem?.id || ""} onChange={(itemId) => setGift({ ...gift, itemId })} options={activeItems.map((item) => ({ value: item.id, label: `${item.name} (${item.price} JC)` }))} />
      <Select label="Send To" value={gift.toStudentId} onChange={(toStudentId) => setGift({ ...gift, toStudentId })} options={[{ value: "", label: "Select student" }, ...recipients.map((student) => ({ value: student.id, label: `${student.name}${student.section ? ` - ${student.section}` : ""}` }))]} />
      <Field label="Gift Message" value={gift.message} onChange={(message) => setGift({ ...gift, message })} />
      {giftItem && <AppearancePreview item={giftItem} />}
      <button>Send Gift</button>
    </form>
    <GiftHistory gifts={gifts} studentId={studentId} embedded />
  </div>;
}

function OwnedAppearance({ data, run, embedded = false }) {
  const [filter, setFilter] = useState({ tier: "all", type: "all", search: "" });
  const equipped = data.student?.appearance?.equipped && typeof data.student.appearance.equipped === "object" ? data.student.appearance.equipped : {};
  const inventory = filterInventoryEntries(data.appearanceInventory || [], filter);
  const renderInventoryEntry = (entry) => {
    const item = entry.item;
    const isEquipped = String(equipped[item.type] || "") === String(item.id);
    return <CosmeticCard
      key={entry.id}
      item={item}
      compact
      meta={`${item.tier} • ${entry.source === "gift" ? `Gift from ${studentName(data.students, entry.fromStudentId)}` : entry.source === "admin_grant" ? "Admin grant" : "Bought"}`}
      note={isEquipped ? "Currently equipped" : item.preview || item.name}
      equipped={isEquipped}
      actions={<>
        <button disabled={isEquipped} className={isEquipped ? "soft" : ""} onClick={() => run(() => post("/appearance/equip", { itemId: item.id }), "Equipped")}>{isEquipped ? "Equipped" : "Equip"}</button>
        {isEquipped && <button className="soft" onClick={() => run(() => post("/appearance/unequip", { type: item.type }), "Unequipped")}>Unequip</button>}
      </>}
    />;
  };
  const content = <>
    <AppearanceProfilePreview student={data.student} />
    <AppearanceFilters filter={filter} setFilter={setFilter} count={inventory.length} />
    <GroupedInventoryTables entries={inventory} renderEntry={renderInventoryEntry} />
  </>;
  if (embedded) return <div className="stacked-panel">{content}</div>;
  return <Panel title="Owned Appearance" wide defaultOpen>{content}</Panel>;
}

function GroupedAppearanceTables({ items, renderItem, emptyText }) {
  const groups = groupByType(items);
  if (!groups.length) return <div className="empty-card">{emptyText}</div>;
  return <div className="appearance-type-groups">
    {groups.map(([type, typeItems]) => <section key={type} className="appearance-type-group">
      <h3>{typeLabel(type)} <span>{typeItems.length}</span></h3>
      <div className="cosmetic-card-grid">{typeItems.map(renderItem)}</div>
    </section>)}
  </div>;
}

function GroupedInventoryTables({ entries, renderEntry }) {
  const groups = groupByType(entries, (entry) => entry.item?.type);
  if (!groups.length) return <div className="empty-card">No owned cosmetics match this search.</div>;
  return <div className="appearance-type-groups">
    {groups.map(([type, typeEntries]) => <section key={type} className="appearance-type-group">
      <h3>{typeLabel(type)} <span>{typeEntries.length}</span></h3>
      <div className="cosmetic-card-grid">{typeEntries.map(renderEntry)}</div>
    </section>)}
  </div>;
}

function CosmeticCard({ item, meta, note, actions, equipped = false, compact = false }) {
  return <article className={`cosmetic-card ${equipped ? "equipped" : ""}`}>
    <AppearancePreview item={item} compact={compact} />
    <div className="cosmetic-card-body">
      <strong>{item.name}</strong>
      <span>{meta}</span>
      {note && <p>{note}</p>}
    </div>
    <div className="cosmetic-card-actions">{actions}</div>
  </article>;
}

function AppearanceProfilePreview({ student }) {
  const appearanceClasses = student?.appearance?.classes?.join(" ") || "";
  const badge = student?.appearance?.items?.badge?.name;
  const icon = student?.appearance?.items?.avatarIcon?.icon || "J";
  return <section className={`appearance-profile-preview appearance-card ${appearanceClasses}`}>
    <CosmeticFx classes={appearanceClasses} />
    <div className="cosmetic-avatar profile-avatar">{icon}</div>
    <div>
      <h2 className="cosmetic-name">{student?.name || "Student"}</h2>
      {badge && <div className="cosmetic-badge">{badge}</div>}
      <p>{Number(student?.currentJCoins || 0).toLocaleString()} JCoins</p>
    </div>
  </section>;
}

function GiftHistory({ gifts, studentId, embedded = false }) {
  const sent = gifts.filter((gift) => gift.fromStudentId === studentId);
  const received = gifts.filter((gift) => gift.toStudentId === studentId);
  const sentRows = sent.map((gift) => [new Date(gift.createdAt).toLocaleString(), gift.itemName, gift.toStudentName, gift.message, gift.pricePaid]);
  const receivedRows = received.map((gift) => [new Date(gift.createdAt).toLocaleString(), gift.itemName, gift.fromStudentName, gift.message]);
  if (embedded) return <div className="gift-history-grid">
    <section>
      <h3>Sent Gifts</h3>
      <Table columns={["Date", "Item", "To", "Message", "Price"]} rows={sentRows} />
    </section>
    <section>
      <h3>Received Gifts</h3>
      <Table columns={["Date", "Item", "From", "Message"]} rows={receivedRows} />
    </section>
  </div>;
  return <>
    <DataTable title="Sent Gifts" columns={["Date", "Item", "To", "Message", "Price"]} rows={sentRows} />
    <DataTable title="Received Gifts" columns={["Date", "Item", "From", "Message"]} rows={receivedRows} />
  </>;
}

function AppearanceFilters({ filter, setFilter, count }) {
  return <div className="filter-bar transaction-filter-bar">
    <Select label="Tier" value={filter.tier} onChange={(tier) => setFilter({ ...filter, tier })} options={[{ value: "all", label: "All tiers" }, ...appearanceTiers.map((tier) => ({ value: tier, label: tier }))]} />
    <Select label="Type" value={filter.type} onChange={(type) => setFilter({ ...filter, type })} options={[{ value: "all", label: "All types" }, ...appearanceTypes.map((type) => ({ value: type, label: type }))]} />
    <Field label="Search Appearance" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
    <div className="filter-count">{count} cosmetic{count === 1 ? "" : "s"}</div>
  </div>;
}

function AppearancePreview({ item, compact = false }) {
  const isAvatar = item.type === "avatarFrame" || item.type === "avatarIcon";
  return <div className={`appearance-preview ${compact ? "appearance-preview-compact" : ""} ${item.styleClass || ""}`}>
    <CosmeticFx classes={item.styleClass || ""} />
    <span>{badgeText(item)}</span>
    {isAvatar && <div className="appearance-avatar-demo cosmetic-avatar">{item.type === "avatarIcon" ? item.icon || "★" : "J"}</div>}
    <strong>{item.name || "Cosmetic"}</strong>
  </div>;
}

function filterAppearanceItems(items, filter) {
  const q = filter.search.trim().toLowerCase();
  return items.filter((item) => {
    const tierMatch = filter.tier === "all" || item.tier === filter.tier;
    const typeMatch = filter.type === "all" || item.type === filter.type;
    const searchMatch = !q || [item.name, item.type, item.tier, item.price, item.preview, item.icon, item.styleClass].some((value) => String(value || "").toLowerCase().includes(q));
    return tierMatch && typeMatch && searchMatch;
  });
}

function filterInventoryEntries(entries, filter) {
  const q = filter.search.trim().toLowerCase();
  return entries.filter((entry) => {
    const item = entry.item;
    if (!item) return false;
    const tierMatch = filter.tier === "all" || item.tier === filter.tier;
    const typeMatch = filter.type === "all" || item.type === filter.type;
    const source = entry.source === "gift" ? "gift" : "bought";
    const searchMatch = !q || [item.name, item.type, item.tier, item.price, item.preview, item.icon, item.styleClass, source].some((value) => String(value || "").toLowerCase().includes(q));
    return tierMatch && typeMatch && searchMatch;
  });
}

function groupByType(items, getType = (item) => item.type) {
  return appearanceTypes
    .map((type) => [type, items.filter((item) => getType(item) === type)])
    .filter(([, typeItems]) => typeItems.length);
}

function typeLabel(type) {
  const labels = {
    background: "Backgrounds",
    border: "Borders",
    nameColor: "Name Colors",
    nameFont: "Name Fonts",
    effect: "Effects",
    badge: "Badges / Titles",
    avatarFrame: "Avatar Frames",
    avatarIcon: "Avatar Icons"
  };
  return labels[type] || type;
}

function badgeText(item) {
  if (item.type === "badge") return item.name || "Badge";
  if (item.type === "avatarFrame") return "Avatar Frame";
  if (item.type === "avatarIcon") return "Avatar Icon";
  return typeLabel(item.type).replace(/s$/, "");
}

function studentName(students, id) {
  return students.find((student) => student.id === id)?.name || "Unknown";
}
