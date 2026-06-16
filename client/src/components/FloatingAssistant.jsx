import React, { useState } from "react";
import { Bot, Send, X } from "lucide-react";
import { postForm } from "../api.js";

export default function FloatingAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", text: "Hi Jerome. Ask me a question, or upload a lesson file and ask for a quiz draft." }]);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  async function send(e) {
    e.preventDefault();
    const message = text.trim();
    if (!message || loading) return;
    const userMessage = { role: "user", text: message, fileName: file?.name || "" };
    setMessages((current) => [...current, userMessage]);
    setText("");
    const recitationIntent = parseRecitationIntent(message);
    if (recitationIntent) {
      setOpen(false);
      window.dispatchEvent(new CustomEvent("jcoins:open-module-action", {
        detail: {
          tab: "Recitation",
          prefillEvent: "jcoins:prefill-recitation",
          openEvent: "jcoins:open-recitation-modal",
          detail: recitationIntent
        }
      }));
      setMessages((current) => [...current, {
        role: "assistant",
        text: `Opening the Recitation modal${recitationIntent.studentQuery ? ` for ${recitationIntent.studentQuery}` : ""}. Please review before saving.`
      }]);
      return;
    }
    setLoading(true);
    try {
      const payload = new FormData();
      payload.append("message", message);
      if (file) payload.append("file", file);
      const result = await postForm("/assistant/chat", payload);
      setMessages((current) => [...current, { role: "assistant", text: result.reply || "Done.", quizDraft: result.quizDraft }]);
      setFile(null);
    } catch (err) {
      setMessages((current) => [...current, { role: "assistant", text: err.message }]);
    } finally {
      setLoading(false);
    }
  }

  return <div className={`ai-assistant ${open ? "open" : ""}`}>
    {open && <section className="ai-panel" aria-label="AI Assistant">
      <div className="ai-head">
        <div><strong>AI Assistant</strong><span>Chat and quiz draft helper</span></div>
        <button type="button" className="soft icon-button" onClick={() => setOpen(false)} aria-label="Close AI Assistant"><X size={18} /></button>
      </div>
      <div className="ai-messages">
        {messages.map((message, index) => <article key={index} className={`ai-message ${message.role}`}>
          <p>{message.text}</p>
          {message.fileName && <small>Reference: {message.fileName}</small>}
          {message.quizDraft && <QuizDraftSummary draft={message.quizDraft} />}
        </article>)}
        {loading && <article className="ai-message assistant"><p>Thinking...</p></article>}
      </div>
      <form className="ai-compose" onSubmit={send}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question or request a quiz draft..." />
        <div className="ai-compose-actions">
          <label className="soft file-button">Attach<input type="file" accept=".pptx,.docx,.pdf,.xlsx,.csv,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
          <button disabled={loading || !text.trim()}><Send size={16} /> Send</button>
        </div>
        {file && <small className="muted-line">{file.name}</small>}
      </form>
    </section>}
    <button type="button" className="ai-fab" onClick={() => setOpen(!open)} aria-label="Open AI Assistant"><Bot size={24} /></button>
  </div>;
}

function parseRecitationIntent(message) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();
  if (!/\brecitation\b/.test(lower)) return null;
  if (!/\b(add|give|record|mark)\b/.test(lower)) return null;
  const amountMatch = lower.match(/\b(\d{1,2})\s*(?:points?|jcoins?)?\b/);
  const amount = amountMatch ? Number(amountMatch[1]) : 1;
  const studentMatch = lower.match(/\b(?:to|for)\s+(.+?)(?:\s+(?:for|in|on)\b|$)/);
  const studentQuery = studentMatch?.[1]?.replace(/\b(recitation|points?|jcoins?)\b/g, "").trim() || "";
  return {
    amount,
    studentQuery,
    remarks: text
  };
}

function QuizDraftSummary({ draft }) {
  return <div className="ai-draft">
    <strong>{draft.title || "Quiz Draft"}</strong>
    <span>{draft.difficulty || "Easy"} | {draft.questions?.length || 0} questions | passing {draft.passingScore || draft.questions?.length || 0}</span>
    {(draft.questions || []).slice(0, 3).map((question, index) => <small key={index}>{index + 1}. {question.prompt}</small>)}
    {(draft.questions || []).length > 3 && <small>...and {(draft.questions || []).length - 3} more</small>}
  </div>;
}
