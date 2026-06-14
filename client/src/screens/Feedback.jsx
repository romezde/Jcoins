import React, { useState } from "react";
import { del, post, put } from "../api.js";
import { Field, Panel, Select, Table } from "../components/ui.jsx";

const categories = ["Bug Report", "Suggestion", "Question / Need Help"];
const statuses = ["New", "Reviewing", "Planned", "Fixed", "Rejected", "Duplicate"];
const openStatuses = ["New", "Reviewing"];

export function StudentFeedback({ data, run }) {
  const feedback = [...(data.feedback || [])].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const openFeedback = feedback.find((entry) => openStatuses.includes(entry.status));
  const editable = openFeedback?.status === "New";
  const [form, setForm] = useState(() => feedbackForm(openFeedback));
  const [imageError, setImageError] = useState("");

  React.useEffect(() => {
    setForm(feedbackForm(openFeedback));
  }, [openFeedback?.id]);

  async function submit(e) {
    e.preventDefault();
    const body = { ...form };
    if (openFeedback) {
      await run(() => put(`/feedback/${openFeedback.id}`, body), "Feedback updated");
    } else {
      await run(() => post("/feedback", body), "Feedback sent");
      setForm(feedbackForm());
    }
  }

  async function pickScreenshot(file) {
    setImageError("");
    try {
      setForm({ ...form, screenshot: await fileToFeedbackScreenshot(file) });
    } catch (err) {
      setImageError(err.message);
    }
  }

  return <div className="dashboard-grid">
    <section className="panel wide feedback-current">
      <div className="section-title">{openFeedback ? "Open Feedback" : "Send Feedback"}</div>
      {openFeedback && <FeedbackCard entry={openFeedback} />}
      {(!openFeedback || editable) ? <form onSubmit={submit}>
        <Select label="Category" value={form.category} onChange={(category) => setForm({ ...form, category })} options={categories} />
        <Field label="Feature / Page" value={form.feature} onChange={(feature) => setForm({ ...form, feature })} />
        <Field label="Short Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
        <label>Details<textarea value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} rows={5} /></label>
        <label className="soft file-button feedback-file-button">Add Screenshot<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => pickScreenshot(e.target.files?.[0])} /></label>
        {imageError && <div className="error">{imageError}</div>}
        {form.screenshot && <div className="feedback-shot-preview"><img src={form.screenshot} alt="Feedback screenshot preview" /><button type="button" className="soft" onClick={() => setForm({ ...form, screenshot: "" })}>Remove Screenshot</button></div>}
        <div className="button-row">
          <button>{openFeedback ? "Save Feedback" : "Send Feedback"}</button>
          {openFeedback && <button type="button" className="danger" onClick={() => confirm("Delete this feedback?") && run(() => del(`/feedback/${openFeedback.id}`), "Feedback deleted")}>Delete Feedback</button>}
        </div>
      </form> : <p className="muted-line">Your feedback is already being reviewed. You can send another after this one is closed.</p>}
    </section>
    <Panel title="Feedback History" wide defaultOpen>
      <Table columns={["Date", "Category", "Title", "Status", "Admin Note"]} rows={feedback.map((entry) => [
        new Date(entry.createdAt).toLocaleString(),
        entry.category,
        entry.title,
        entry.status,
        entry.adminNote || ""
      ])} />
    </Panel>
  </div>;
}

export function StaffFeedback({ data, run }) {
  const [filter, setFilter] = useState({ status: "all", category: "all", search: "" });
  const q = filter.search.trim().toLowerCase();
  const rows = (data.feedback || []).filter((entry) => {
    const statusMatch = filter.status === "all" || entry.status === filter.status;
    const categoryMatch = filter.category === "all" || entry.category === filter.category;
    const searchMatch = !q || [entry.studentName, entry.section, entry.title, entry.details, entry.feature].some((value) => String(value || "").toLowerCase().includes(q));
    return statusMatch && categoryMatch && searchMatch;
  });

  return <Panel title="Student Feedback" wide defaultOpen>
    <div className="filter-bar">
      <Select label="Status" value={filter.status} onChange={(status) => setFilter({ ...filter, status })} options={[{ value: "all", label: "All statuses" }, ...statuses.map((status) => ({ value: status, label: status }))]} />
      <Select label="Category" value={filter.category} onChange={(category) => setFilter({ ...filter, category })} options={[{ value: "all", label: "All categories" }, ...categories.map((category) => ({ value: category, label: category }))]} />
      <Field label="Search Feedback" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
      <div className="filter-count">{rows.length} item{rows.length === 1 ? "" : "s"}</div>
    </div>
    <Table columns={["Student", "Category", "Feedback", "Screenshot", "Status", "Actions"]} rows={rows.map((entry) => [
      <div><strong>{entry.studentName}</strong><p className="muted-line">{entry.section || "No section"}</p></div>,
      entry.category,
      <div className="feedback-details"><strong>{entry.title}</strong><span>{entry.feature}</span><p>{entry.details}</p>{entry.adminNote && <small>Note: {entry.adminNote}</small>}</div>,
      entry.screenshot ? <a className="feedback-shot-link" href={entry.screenshot} target="_blank" rel="noreferrer">View</a> : "None",
      entry.status,
      <FeedbackActions entry={entry} run={run} />
    ])} />
  </Panel>;
}

function FeedbackActions({ entry, run }) {
  const [adminNote, setAdminNote] = useState(entry.adminNote || "");
  return <div className="feedback-actions">
    <input value={adminNote} placeholder="Admin note" onChange={(e) => setAdminNote(e.target.value)} />
    <div className="inline">
      {statuses.map((status) => <button key={status} type="button" className={entry.status === status ? "" : "soft"} onClick={() => run(() => put(`/admin/feedback/${entry.id}`, { status, adminNote }), `Marked ${status}`)}>{status}</button>)}
    </div>
  </div>;
}

function FeedbackCard({ entry }) {
  return <article className={`request-card feedback-card request-${entry.status?.toLowerCase()}`}>
    <div>
      <span className="request-status">{entry.status}</span>
      <strong>{entry.title}</strong>
      <p>{entry.category} {entry.feature ? `- ${entry.feature}` : ""}</p>
      <small>{new Date(entry.createdAt).toLocaleString()}</small>
    </div>
  </article>;
}

function feedbackForm(entry = null) {
  return {
    category: entry?.category || "Suggestion",
    feature: entry?.feature || "",
    title: entry?.title || "",
    details: entry?.details || "",
    screenshot: entry?.screenshot || ""
  };
}

async function fileToFeedbackScreenshot(file) {
  if (!file) return "";
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await loadImage(file);
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.68);
  if (dataUrl.length > 680000) throw new Error("Screenshot is too large. Try a smaller crop.");
  return dataUrl;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image."));
    };
    image.src = url;
  });
}
