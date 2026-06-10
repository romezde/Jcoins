import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function Field({ label, value, onChange, type = "text", children }) {
  return <label>{label}{children || <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />}</label>;
}

export function Select({ label, value, onChange, options }) {
  return <label>{label}<select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.value ?? o.id ?? o} value={o.value ?? o.id ?? o}>{o.label ?? o.name ?? o}</option>)}</select></label>;
}

export function Panel({ title, children, wide = false, defaultOpen = true, actions }) {
  const [open, setOpen] = useState(defaultOpen);
  return <section className={`panel ${wide ? "wide" : ""}`}>
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

export function ActionModal({ title, buttonLabel = title, children }) {
  const [open, setOpen] = useState(false);
  return <>
    <section className="action-modal-launch">
      <button type="button" onClick={() => setOpen(true)}>{buttonLabel}</button>
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
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visibleRows = rows.slice(start, start + pageSize);

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  return <>
    <div className="table-wrap"><table><thead><tr>{columns.map((c) => <th key={String(c)}>{c}</th>)}</tr></thead><tbody>{visibleRows.length ? visibleRows.map((r, i) => <tr key={start + i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>) : <tr><td colSpan={columns.length}>No records yet.</td></tr>}</tbody></table></div>
    {rows.length > pageSize && <div className="pagination-bar">
      <span>Showing {start + 1}-{Math.min(start + pageSize, rows.length)} of {rows.length}</span>
      <div className="pagination-actions">
        <button type="button" className="soft" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <strong>Page {currentPage} / {totalPages}</strong>
        <button type="button" className="soft" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
      </div>
    </div>}
  </>;
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
  return <div className={`dropdown-checklist ${compact ? "dropdown-checklist-compact" : ""}`}>
    {!compact && <label>{label}</label>}
    <button type="button" className="soft dropdown-checklist-trigger" onClick={() => setOpen(!open)}>
      <span>{summary}</span>
      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
    </button>
    {open && <div className="dropdown-checklist-menu">
      <div className="button-row">
        <button type="button" className="soft" onClick={() => onChange(items.map((i) => i.id))}>Check All</button>
        <button type="button" className="soft" onClick={() => onChange([])}>Uncheck</button>
      </div>
      {items.map((i) => <label key={i.id} className="check"><input type="checkbox" checked={ids.includes(i.id)} onChange={() => toggle(i.id)} />{i.name}</label>)}
    </div>}
  </div>;
}
