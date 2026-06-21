import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Plus } from "lucide-react";

export function Field({ label, value, onChange, type = "text", children, ...inputProps }) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const input = <input {...inputProps} type={isPassword && showPassword ? "text" : type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  return <label>{label}{children || (isPassword ? <span className="password-field">
    {input}
    <button type="button" className="soft password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  </span> : input)}</label>;
}

export function Select({ label, value, onChange, options }) {
  return <label>{label}<select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.value ?? o.id ?? o} value={o.value ?? o.id ?? o}>{o.label ?? o.name ?? o}</option>)}</select></label>;
}

export function Panel({ title, children, wide = false, defaultOpen = true, actions }) {
  const [open, setOpen] = useState(defaultOpen);
  return <section className={`panel ${wide ? "wide" : ""} ${open ? "open" : ""}`}>
    <div className="section-head">
      <button type="button" className="ghost section-toggle" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <span>{title}</span>
      </button>
      {actions}
    </div>
    {open && <div className="panel-body">{children}</div>}
  </section>;
}

export function ActionModal({ title, buttonLabel = title, children, openEvent, icon: Icon = Plus }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!openEvent) return undefined;
    const openModal = () => setOpen(true);
    window.addEventListener(openEvent, openModal);
    return () => window.removeEventListener(openEvent, openModal);
  }, [openEvent]);
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener("jcoins:action-success", close);
    return () => window.removeEventListener("jcoins:action-success", close);
  }, [open]);
  return <>
    <section className="action-modal-launch">
      <button type="button" onClick={() => setOpen(true)}><Icon size={16} />{buttonLabel}</button>
    </section>
    {open && <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card modal-card-wide">
        <div className="section-head">
          <div className="section-title">{title}</div>
          <button type="button" className="soft" onClick={() => setOpen(false)}>Close</button>
        </div>
        <div className="panel-body">{children}</div>
      </section>
    </div>}
  </>;
}

export function Stat({ title, value }) {
  return <section className="panel stat"><span>{title}</span><strong>{value}</strong></section>;
}

export function DataTable({ title, columns, rows, defaultOpen = false }) {
  return <Panel title={title} wide defaultOpen={defaultOpen}><Table columns={columns} rows={rows} /></Panel>;
}

export function Table({ columns, rows, pageSize = 10 }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ index: null, direction: "asc" });
  const sortedRows = useMemo(() => sort.index == null ? rows : [...rows].sort((a, b) => compareCells(a[sort.index], b[sort.index], sort.direction)), [rows, sort.index, sort.direction]);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visibleRows = sortedRows.slice(start, start + pageSize);

  function toggleSort(index) {
    setSort((current) => current.index === index
      ? { index, direction: current.direction === "asc" ? "desc" : "asc" }
      : { index, direction: "asc" });
    setPage(1);
  }

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  return <>
    <div className="table-sort-bar" aria-label="Sort table">
      {columns.map((column, index) => <button key={String(column)} type="button" className={sort.index === index ? "soft active" : "soft"} onClick={() => toggleSort(index)}>
        {column} {sort.index === index ? sort.direction === "asc" ? "↑" : "↓" : "↕"}
      </button>)}
    </div>
    <div className="table-wrap"><table><thead><tr>{columns.map((c, index) => <th key={String(c)}><button type="button" className="table-sort-button" onClick={() => toggleSort(index)}>{c} {sort.index === index ? sort.direction === "asc" ? "↑" : "↓" : "↕"}</button></th>)}</tr></thead><tbody>{visibleRows.length ? visibleRows.map((r, i) => <tr key={start + i}>{r.map((c, j) => <td key={j} data-label={String(columns[j] || "")}>{c}</td>)}</tr>) : <tr><td className="empty-cell" colSpan={columns.length}>No records yet.</td></tr>}</tbody></table></div>
    {rows.length > pageSize && <div className="pagination-bar">
      <span>Showing {start + 1}-{Math.min(start + pageSize, sortedRows.length)} of {sortedRows.length}</span>
      <div className="pagination-actions">
        <button type="button" className="soft" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <strong>Page {currentPage} / {totalPages}</strong>
        <button type="button" className="soft" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
      </div>
    </div>}
  </>;
}

function compareCells(a, b, direction) {
  const aValue = sortValue(a);
  const bValue = sortValue(b);
  const multiplier = direction === "asc" ? 1 : -1;
  if (aValue.type === "number" && bValue.type === "number") return (aValue.value - bValue.value) * multiplier;
  if (aValue.type === "date" && bValue.type === "date") return (aValue.value - bValue.value) * multiplier;
  return String(aValue.value).localeCompare(String(bValue.value), undefined, { numeric: true, sensitivity: "base" }) * multiplier;
}

function sortValue(cell) {
  const value = extractCellText(cell).trim();
  const numeric = Number(value.replace(/,/g, ""));
  if (value !== "" && Number.isFinite(numeric)) return { type: "number", value: numeric };
  const date = Date.parse(value);
  if (value && Number.isFinite(date) && /[-/:,]|\b(am|pm)\b/i.test(value)) return { type: "date", value: date };
  return { type: "text", value };
}

function extractCellText(cell) {
  if (cell == null || typeof cell === "boolean") return "";
  if (typeof cell === "string" || typeof cell === "number") return String(cell);
  if (Array.isArray(cell)) return cell.map(extractCellText).join(" ");
  if (React.isValidElement(cell)) {
    if (cell.props?.value != null) return String(cell.props.value);
    return extractCellText(cell.props?.children);
  }
  if (typeof cell === "object" && "value" in cell) return extractCellText(cell.value);
  return String(cell);
}

export function Checklist({ title, items, selected, onChange, compact = false }) {
  const ids = selected || [];
  const toggle = (id) => onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  return <div className={compact ? "checklist compact-checks" : "checklist"}>
    {title && <div className="subhead">{title}</div>}
    <div className="button-row">
      <button type="button" className="soft" onClick={() => onChange(items.map((i) => i.id))}>Check All</button>
      <button type="button" className="soft" onClick={() => onChange([])}>Uncheck</button>
    </div>
    {items.map((i) => <label key={i.id} className="check"><input type="checkbox" checked={ids.includes(i.id)} onChange={() => toggle(i.id)} />{i.name}</label>)}
  </div>;
}

export function DropdownChecklist({ label = "Select", items, selected, onChange, compact = false }) {
  const [open, setOpen] = useState(false);
  const ids = selected || [];
  const toggle = (id) => onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const names = items.filter((item) => ids.includes(item.id)).map((item) => item.name);
  const summary = names.length ? names.length <= 2 ? names.join(", ") : `${names.length} selected` : "None selected";
  return <div className={`dropdown-checklist ${compact ? "dropdown-checklist-compact" : ""} ${open ? "dropdown-checklist-open" : ""}`}>
    {!compact && <label>{label}</label>}
    <button type="button" className="soft dropdown-checklist-trigger" onClick={() => setOpen(true)}>
      <span>{summary}</span>
      <ChevronRight size={16} />
    </button>
    {open && <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card checklist-modal">
        <div className="section-head">
          <div className="section-title">{label}</div>
          <button type="button" className="soft" onClick={() => setOpen(false)}>Close</button>
        </div>
        <div className="button-row">
          <button type="button" className="soft" onClick={() => onChange(items.map((i) => i.id))}>Check All</button>
          <button type="button" className="soft" onClick={() => onChange([])}>Uncheck</button>
        </div>
        <div className="dropdown-checklist-menu">
          {items.map((i) => <label key={i.id} className="check"><input type="checkbox" checked={ids.includes(i.id)} onChange={() => toggle(i.id)} />{i.name}</label>)}
        </div>
      </section>
    </div>}
  </div>;
}
