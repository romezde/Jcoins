import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Eye, X } from "lucide-react";
import { request } from "../api.js";

export default function ActivityFileViewer({ activityId, studentId, files }) {
  const list = (files || []).filter((file) => file.fileName);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState({});
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const fileSignature = list.map((file) => `${file.fileIndex ?? ""}:${file.fileName}`).join("|");

  useEffect(() => {
    setOpen(false);
    setIndex(0);
    setLoaded({});
    setLoading(false);
    setDownloading(false);
    setError("");
  }, [activityId, studentId, fileSignature]);

  useEffect(() => {
    if (!open || loaded[index]) return undefined;
    let active = true;
    const file = list[index];
    const fileIndex = Number.isInteger(file?.fileIndex) ? file.fileIndex : index;
    setLoading(true);
    setError("");
    request(`/activities/${activityId}/submissions/${studentId}/files/${fileIndex}`, { timeoutMs: 5 * 60 * 1000 })
      .then((data) => {
        if (active) setLoaded((current) => ({ ...current, [index]: data.file }));
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "Could not open file.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, index, activityId, studentId]);

  async function downloadFiles() {
    setDownloading(true);
    setError("");
    try {
      for (let position = 0; position < list.length; position += 1) {
        const file = list[position];
        const fileIndex = Number.isInteger(file.fileIndex) ? file.fileIndex : position;
        const downloadedFile = loaded[position] || (await request(`/activities/${activityId}/submissions/${studentId}/files/${fileIndex}`, { timeoutMs: 5 * 60 * 1000 })).file;
        if (!downloadedFile?.fileData) throw new Error(`Could not download ${file.fileName}.`);
        triggerDownload(downloadedFile);
      }
    } catch (downloadError) {
      setError(downloadError.message || "Could not download file.");
    } finally {
      setDownloading(false);
    }
  }

  if (!list.length) return "-";
  const current = loaded[index];
  return <>
    <div className="activity-file-list">
      <div className="activity-file-actions">
        <button type="button" className="soft file-view-link" onClick={() => { setIndex(0); setOpen(true); }}>
          <Eye size={16} /> View
        </button>
        <button type="button" className="soft file-view-link" onClick={downloadFiles} disabled={downloading}>
          <Download size={16} /> {downloading ? "Downloading..." : list.length > 1 ? "Download all" : "Download"}
        </button>
      </div>
      <small>{list.map((file) => file.fileName).join(", ")}</small>
      {!open && error && <span className="inline-error">{error}</span>}
    </div>
    {open && <div className="modal-backdrop activity-viewer-backdrop" role="dialog" aria-modal="true">
      <section className="activity-viewer">
        <header className="activity-viewer-head">
          <div>
            <strong>{list[index]?.fileName}</strong>
            <span>{index + 1} of {list.length}</span>
          </div>
          <button type="button" className="soft" onClick={() => setOpen(false)} aria-label="Close viewer"><X size={18} /></button>
        </header>
        <div className="activity-viewer-stage">
          {loading ? <div className="activity-viewer-state">Loading preview...</div> : error ? <div className="activity-viewer-state error">{error}</div> : <FilePreview file={current} />}
        </div>
        {list.length > 1 && <footer className="activity-viewer-nav">
          <button type="button" className="soft" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={18} /> Previous</button>
          <span>{index + 1} / {list.length}</span>
          <button type="button" className="soft" disabled={index === list.length - 1} onClick={() => setIndex(index + 1)}>Next <ChevronRight size={18} /></button>
        </footer>}
      </section>
    </div>}
  </>;
}

function triggerDownload(file) {
  const link = document.createElement("a");
  link.href = file.fileData;
  link.download = file.fileName || "activity-file";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function FilePreview({ file }) {
  if (!file?.fileData) return <div className="activity-viewer-state">Preview is unavailable.</div>;
  const extension = String(file.fileName || "").split(".").pop()?.toLowerCase();
  const mime = String(file.fileType || "").toLowerCase();
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(extension)) {
    return <img className="activity-viewer-image" src={file.fileData} alt={file.fileName || "Activity submission"} />;
  }
  if (mime.includes("pdf") || extension === "pdf") {
    return <iframe className="activity-viewer-frame" src={file.fileData} title={file.fileName || "PDF submission"} />;
  }
  if (file.previewText) return <pre className="activity-viewer-text">{file.previewText}</pre>;
  return <div className="activity-viewer-state">This older file format cannot be rendered by the browser. Ask the student to upload DOCX, PPTX, XLSX, PDF, TXT, CSV, or an image for an in-app preview.</div>;
}
