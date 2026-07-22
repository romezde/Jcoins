import React, { useEffect, useMemo, useRef, useState } from "react";
import { FileCheck2, Pencil, Printer } from "lucide-react";
import { del, post, postForm, put, today } from "../api.js";
import { ActionModal, Checklist, DropdownChecklist, Field, Panel, Select, Table } from "../components/ui.jsx";
import SubjectSectionPicker, { buildSubjectSectionClasses } from "../components/SubjectSectionPicker.jsx";

const questionTypeOptions = [
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "true_false", label: "True / False" },
  { value: "fill_blank", label: "Fill in the Blank" },
  { value: "matching", label: "Matching Type" },
  { value: "multiple_select", label: "Multiple Select" },
  { value: "numerical", label: "Numerical Answer" },
  { value: "computation", label: "Computation with Final Answer" }
];
const quizTypeOptions = [{ value: "mixed", label: "Mixed Question Types" }, ...questionTypeOptions];
const quizTypeChecklistItems = questionTypeOptions.map((option) => ({ id: option.value, name: option.label }));
const blankQuestion = (type = "multiple_choice") => {
  const base = { id: crypto.randomUUID(), type, prompt: "", options: [], answer: "" };
  if (type === "true_false") return { ...base, options: ["True", "False"], answer: "True" };
  if (["multiple_choice", "multiple_select"].includes(type)) return { ...base, options: ["", "", "", ""], ...(type === "multiple_select" ? { answers: [] } : {}) };
  if (type === "fill_blank") return { ...base, acceptedAnswers: [""] };
  if (type === "matching") return { ...base, matchingPairs: [blankMatch(), blankMatch()] };
  return { ...base, tolerance: 0 };
};
const blankMatch = () => ({ id: crypto.randomUUID(), left: "", right: "" });
const answerVisibility = [
  { value: "immediate", label: "Immediately after submission" },
  { value: "after_deadline", label: "After deadline" },
  { value: "scheduled", label: "On specific date/time" },
  { value: "never", label: "Never" }
];
const aiReferenceLimits = { count: 10, perFileBytes: 25 * 1024 * 1024, totalBytes: 100 * 1024 * 1024 };
const paperQuizTypes = ["multiple_choice", "true_false", "matching"];
const paperQuizVariants = ["A", "B", "C", "D"];
const paperScanMarkerBounds = { left: 46, top: 50, right: 954, bottom: 1405 };

export default function Quizzes({ data, run, role }) {
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [filter, setFilter] = useState({ status: "all", search: "" });
  const classes = useMemo(() => buildSubjectSectionClasses(data, (subjectId, section) => (data.quizzes || []).filter((quiz) => quiz.subjectId === subjectId && quiz.section === section).length), [data.subjects, data.students, data.quizzes]);
  const activeClass = classes.find((item) => item.key === selectedClassKey) || null;
  const quizzes = (data.quizzes || []).filter((quiz) => {
    const q = filter.search.trim().toLowerCase();
    return activeClass
      && quiz.subjectId === activeClass.subjectId
      && quiz.section === activeClass.section
      && (filter.status === "all" || quiz.status === filter.status)
      && (!q || [quiz.title, quiz.subjectName, quiz.section, quiz.difficulty, quiz.status].some((value) => String(value || "").toLowerCase().includes(q)));
  });
  if (role === "student") return <StudentQuizzes data={data} run={run} />;
  return <div className="dashboard-grid">
    <QuizFormModal data={data} run={run} onCreated={(quiz) => setSelectedClassKey(`${quiz.subjectId}::${quiz.section || "__none"}`)} />
    <SubjectSectionPicker classes={classes} selectedKey={selectedClassKey} onSelect={setSelectedClassKey} title="Quiz Classes" itemLabel="quizzes" />
    {activeClass && <Panel title={`${activeClass.subjectName} · ${activeClass.sectionLabel}`} wide defaultOpen>
      <div className="filter-bar">
        <Select label="Status" value={filter.status} onChange={(status) => setFilter({ ...filter, status })} options={[{ value: "all", label: "All" }, { value: "draft", label: "Draft" }, { value: "published", label: "Published" }, { value: "closed", label: "Closed" }]} />
        <Field label="Search" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
      </div>
      <Table columns={["Quiz", "Subject", "Section", "Status", "Difficulty", "Time", "Deadline", "Tracker", "Actions"]} rows={quizzes.map((quiz) => [
        quiz.title,
        quiz.subjectName,
        quiz.section,
        statusLabel(quiz.status),
        `${quiz.difficulty} (${quiz.rewardValue} JC) | ${quizTypesLabel(quiz)}`,
        `${quiz.timeLimitMinutes} min`,
        quiz.deadline,
        quiz.tracker,
        <QuizActions quiz={quiz} data={data} run={run} />
      ])} />
    </Panel>}
    {activeClass && quizzes.map((quiz) => <QuizCard key={quiz.id} quiz={quiz} data={data} run={run} />)}
    {!activeClass && <section className="panel wide attendance-empty">Choose a subject and section above to view its quizzes.</section>}
  </div>;
}

function QuizFormModal({ data, run, quiz = null, onCreated }) {
  const firstSubject = data.subjects.find((subject) => quizSectionsForSubject(data, subject.id).length)?.id || data.subjects[0]?.id || "";
  const firstSection = preferredQuizSection(data, firstSubject);
  const [form, setForm] = useState(() => quiz ? {
    ...quiz,
    quizTypes: quizTypesForQuiz(quiz),
    questions: quiz.questions.map(cloneQuestion),
    retakeStudentIds: [...(quiz.retakeStudentIds || [])]
  } : ({
    title: "New Quiz",
    subjectId: firstSubject,
    section: firstSection,
    difficulty: "Easy",
    quizType: "multiple_choice",
    quizTypes: ["multiple_choice"],
    deadline: today(),
    timeLimitMinutes: 30,
    passingScore: 1,
    questions: [blankQuestion("multiple_choice")],
    retakeMode: "none",
    retakeStudentIds: [],
    answerVisibility: data.settings.quizzes?.defaultAnswerVisibility || "after_deadline",
    answerRevealAt: "",
    shuffleQuestions: false,
    shuffleOptions: false
  }));
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiFiles, setAiFiles] = useState([]);
  const [aiMessage, setAiMessage] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const groupStudents = studentsForQuiz(data, form);
  const hasAttempts = !!quiz && ((quiz.submittedCount || 0) > 0 || (quiz.submissions || []).some((submission) => submission.activeAttempt));

  async function generateDraft() {
    if (aiGenerating) return;
    const fileError = validateAiReferenceFiles(aiFiles);
    if (fileError) {
      setAiMessage(fileError);
      return;
    }
    setAiMessage("Generating quiz draft...");
    setAiGenerating(true);
    const payload = new FormData();
    const allowedTypes = selectedQuizTypes(form);
    const typeNames = allowedTypes.map((type) => questionTypeOptions.find((option) => option.value === type)?.label || type).join(", ");
    payload.append("message", `${aiPrompt || `Create an auto-gradable ${form.difficulty} quiz.`}\nUse only these question types: ${typeNames}.`);
    aiFiles.forEach((file) => payload.append("files", file));
    try {
      const result = await postForm("/assistant/chat", payload, 5 * 60 * 1000);
      if (result.quizDraft?.questions?.length) {
        const questions = result.quizDraft.questions.map((question, index) => {
          const type = allowedTypes.includes(question.type) ? question.type : allowedTypes[index % allowedTypes.length];
          return cloneQuestion({ ...blankQuestion(type), ...question, type, id: crypto.randomUUID() });
        });
        setForm({
          ...form,
          title: result.quizDraft.title || form.title,
          difficulty: result.quizDraft.difficulty || form.difficulty,
          quizType: allowedTypes.length === 1 ? allowedTypes[0] : "mixed",
          quizTypes: allowedTypes,
          questions,
          passingScore: Math.min(Number(result.quizDraft.passingScore || questions.length), questions.length)
        });
      }
      setAiMessage(result.reply || "Draft ready.");
    } catch (err) {
      setAiMessage(err.message);
    } finally {
      setAiGenerating(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (hasAttempts && !confirm("Save changes to this quiz? Existing attempts and scores will keep their original version. New attempts and retakes will use the edited version.")) return;
    const result = await run(() => quiz
      ? put(`/admin/quizzes/${quiz.id}`, cleanQuizForm(form))
      : post("/admin/quizzes", cleanQuizForm(form)), quiz ? "Quiz updated" : "Quiz draft created");
    if (!quiz && result?.quiz) onCreated?.(result.quiz);
  }

  const sectionOptions = hasAttempts ? [form.section] : quizSectionsForSubject(data, form.subjectId);

  return <ActionModal title={quiz ? `Edit ${quiz.title}` : "Create Quiz"} buttonLabel={quiz ? "Edit" : "Create Quiz"} icon={quiz ? Pencil : undefined}>
    <form onSubmit={submit}>
      <div className="form-grid two">
        <Field label="Quiz Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
        <Select label="Subject" value={form.subjectId} onChange={(subjectId) => setForm({ ...form, subjectId, section: preferredQuizSection(data, subjectId, form.section), retakeStudentIds: [] })} options={hasAttempts ? data.subjects.filter((subject) => subject.id === form.subjectId) : data.subjects} />
        <Select label="Section" value={form.section} onChange={(section) => setForm({ ...form, section, retakeStudentIds: [] })} options={sectionOptions.map((section) => ({ value: section, label: section }))} />
        <Select label="Difficulty" value={form.difficulty} onChange={(difficulty) => setForm({ ...form, difficulty })} options={(data.settings.quizzes?.difficulties || []).map((item) => ({ value: item.name, label: `${item.name} (${item.points} JC)` }))} />
        <Field label="Deadline" type="date" value={form.deadline} onChange={(deadline) => setForm({ ...form, deadline })} />
        <Field label="Time Limit (minutes)" type="number" min="1" max="240" step="1" required value={form.timeLimitMinutes} onChange={(timeLimitMinutes) => setForm({ ...form, timeLimitMinutes })} />
        <Field label="Passing Score" type="number" value={form.passingScore} onChange={(passingScore) => setForm({ ...form, passingScore })} />
        <Select label="Answer Reveal" value={form.answerVisibility} onChange={(answerVisibility) => setForm({ ...form, answerVisibility })} options={answerVisibility} />
        {form.answerVisibility === "scheduled" && <Field label="Reveal Date/Time" type="datetime-local" value={form.answerRevealAt} onChange={(answerRevealAt) => setForm({ ...form, answerRevealAt })} />}
      </div>
      <Checklist title="Quiz Types" items={quizTypeChecklistItems} selected={selectedQuizTypes(form)} compact onChange={(quizTypes) => {
        if (!quizTypes.length) return;
        const fallbackType = quizTypes[0];
        setForm({ ...form, quizTypes, quizType: quizTypes.length === 1 ? fallbackType : "mixed", questions: form.questions.map((question) => quizTypes.includes(question.type) ? question : convertQuestionType(question, fallbackType)) });
      }} />
      {hasAttempts && <div className="notice">Existing attempts and scores are protected. Saved edits apply only to new attempts and retakes; subject and section stay locked.</div>}
      <div className="checklist compact-checks">
        <label className="check"><input type="checkbox" checked={form.shuffleQuestions} onChange={(e) => setForm({ ...form, shuffleQuestions: e.target.checked })} />Shuffle questions</label>
        <label className="check"><input type="checkbox" checked={form.shuffleOptions} onChange={(e) => setForm({ ...form, shuffleOptions: e.target.checked })} />Shuffle options</label>
      </div>
      <Panel title="AI Draft Helper" defaultOpen={false}>
        <Field label="Ask AI" value={aiPrompt} onChange={setAiPrompt} />
        <label>Reference Files<input type="file" multiple accept=".pptx,.docx,.pdf,.xlsx,.csv,.txt" onChange={(event) => {
          const nextFiles = mergeAiReferenceFiles(aiFiles, [...(event.target.files || [])]);
          setAiFiles(nextFiles);
          setAiMessage(validateAiReferenceFiles(nextFiles));
          event.target.value = "";
        }} /></label>
        {aiFiles.length > 0 && <div className="selected-reference-files">
          {aiFiles.map((file, index) => <div className="inline" key={`${file.name}-${file.size}-${file.lastModified}`}>
            <span>{file.name} ({formatFileSize(file.size)})</span>
            <button type="button" className="danger" onClick={() => {
              const nextFiles = aiFiles.filter((_, itemIndex) => itemIndex !== index);
              setAiFiles(nextFiles);
              setAiMessage(validateAiReferenceFiles(nextFiles));
            }}>Remove</button>
          </div>)}
          <button type="button" className="soft" onClick={() => { setAiFiles([]); setAiMessage(""); }}>Clear Files</button>
        </div>}
        <p className="muted-line">Up to 10 files, 25 MB each and 100 MB combined.</p>
        <button type="button" className="soft" disabled={aiGenerating} onClick={generateDraft}>{aiGenerating ? "Generating Draft..." : "Generate Editable Draft"}</button>
        {aiMessage && <p className="muted-line">{aiMessage}</p>}
      </Panel>
      <QuestionEditor quizTypes={selectedQuizTypes(form)} questions={form.questions} setQuestions={(questions) => setForm({ ...form, questions, passingScore: Math.min(Number(form.passingScore || questions.length), Math.max(1, questions.length)) })} />
      <div className="quiz-retake-controls">
        <label className="check"><input type="checkbox" checked={form.retakeMode === "all"} onChange={(event) => setForm({ ...form, retakeMode: event.target.checked ? "all" : form.retakeStudentIds.length ? "selected" : "none", retakeStudentIds: event.target.checked ? [] : form.retakeStudentIds })} />Allow all students to retake</label>
        {form.retakeMode !== "all" && <DropdownChecklist label="Specific students allowed to retake" items={groupStudents.map((student) => ({ id: student.id, name: student.name }))} selected={form.retakeStudentIds} onChange={(retakeStudentIds) => setForm({ ...form, retakeMode: retakeStudentIds.length ? "selected" : "none", retakeStudentIds })} />}
      </div>
      <button>{quiz ? "Save Changes" : "Create Draft"}</button>
    </form>
  </ActionModal>;
}

function mergeAiReferenceFiles(current, added) {
  const files = [...current];
  added.forEach((file) => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (!files.some((item) => `${item.name}:${item.size}:${item.lastModified}` === key)) files.push(file);
  });
  return files;
}

function validateAiReferenceFiles(files) {
  if (files.length > aiReferenceLimits.count) return "Upload up to 10 reference files.";
  const oversized = files.find((file) => file.size > aiReferenceLimits.perFileBytes);
  if (oversized) return `${oversized.name} is too large. Maximum size is 25 MB per file.`;
  if (files.reduce((sum, file) => sum + file.size, 0) > aiReferenceLimits.totalBytes) return "Reference files are too large. Maximum combined size is 100 MB.";
  return "";
}

function formatFileSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

function QuestionEditor({ quizTypes, questions, setQuestions }) {
  const allowedTypes = quizTypes.length ? quizTypes : ["multiple_choice"];
  function update(index, next) {
    setQuestions(questions.map((question, itemIndex) => itemIndex === index ? next : question));
  }
  return <div className="quiz-question-editor">
    <div className="section-title">Questions</div>
    {questions.map((question, index) => <section key={question.id} className="quiz-question-card">
      <div className="section-head">
        <strong>Question {index + 1}</strong>
        <button type="button" className="danger" disabled={questions.length === 1} onClick={() => setQuestions(questions.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
      </div>
      <Select label="Question Type" value={question.type} onChange={(type) => update(index, convertQuestionType(question, type))} options={questionTypeOptions.filter((option) => allowedTypes.includes(option.value))} />
      <Field label="Prompt" value={question.prompt} onChange={(prompt) => update(index, { ...question, prompt })} />
      <QuestionAnswerEditor question={question} onChange={(next) => update(index, next)} />
    </section>)}
    <button type="button" className="soft" onClick={() => setQuestions([...questions, blankQuestion(allowedTypes[0])])}>Add Question</button>
  </div>;
}

function QuestionAnswerEditor({ question, onChange }) {
  if (question.type === "true_false") {
    return <Select label="Correct Answer" value={question.answer} onChange={(answer) => onChange({ ...question, answer })} options={["True", "False"].map((value) => ({ value, label: value }))} />;
  }
  if (question.type === "multiple_choice") return <>
    <OptionFields question={question} onChange={onChange} />
    <Select label="Correct Answer" value={question.answer} onChange={(answer) => onChange({ ...question, answer })} options={question.options.filter(Boolean).map((option) => ({ value: option, label: option }))} />
  </>;
  if (question.type === "multiple_select") return <>
    <OptionFields question={question} onChange={onChange} />
    <div className="quiz-correct-checks">
      <span>Correct Answers</span>
      {question.options.filter(Boolean).map((option) => <label className="check" key={option}>
        <input type="checkbox" checked={(question.answers || []).includes(option)} onChange={(event) => onChange({ ...question, answers: event.target.checked ? [...(question.answers || []), option] : (question.answers || []).filter((answer) => answer !== option) })} />
        {option}
      </label>)}
    </div>
  </>;
  if (question.type === "fill_blank") {
    return <><Field label="Accepted Answers (separate with semicolons)" value={(question.acceptedAnswers || [question.answer || ""]).join("; ")} onChange={(value) => onChange({ ...question, acceptedAnswers: value.split(";") })} /><p className="muted-line">Capitalization and extra spaces are ignored.</p></>;
  }
  if (question.type === "matching") return <div className="quiz-matching-editor">
    {(question.matchingPairs || []).map((pair, pairIndex) => <div className="quiz-match-row" key={pair.id}>
      <Field label={`Item ${pairIndex + 1}`} value={pair.left} onChange={(left) => onChange({ ...question, matchingPairs: question.matchingPairs.map((item) => item.id === pair.id ? { ...item, left } : item) })} />
      <Field label="Correct Match" value={pair.right} onChange={(right) => onChange({ ...question, matchingPairs: question.matchingPairs.map((item) => item.id === pair.id ? { ...item, right } : item) })} />
      <button type="button" className="danger" disabled={question.matchingPairs.length <= 2} onClick={() => onChange({ ...question, matchingPairs: question.matchingPairs.filter((item) => item.id !== pair.id) })}>Remove</button>
    </div>)}
    <button type="button" className="soft" onClick={() => onChange({ ...question, matchingPairs: [...(question.matchingPairs || []), blankMatch()] })}>Add Match</button>
  </div>;
  return <div className="form-grid two">
    <Field label="Correct Numerical Answer" type="number" step="any" value={question.answer} onChange={(answer) => onChange({ ...question, answer })} />
    <Field label="Accepted Tolerance (+/-)" type="number" min="0" step="any" value={question.tolerance ?? 0} onChange={(tolerance) => onChange({ ...question, tolerance })} />
    {question.type === "computation" && <p className="muted-line">Only the student's final numerical answer is auto-checked.</p>}
  </div>;
}

function OptionFields({ question, onChange }) {
  return question.options.map((option, optionIndex) => <Field key={optionIndex} label={`Option ${optionIndex + 1}`} value={option} onChange={(value) => {
    const options = question.options.map((item, itemIndex) => itemIndex === optionIndex ? value : item);
    const answer = question.answer === option ? value : question.answer;
    const answers = (question.answers || []).map((item) => item === option ? value : item);
    onChange({ ...question, options, answer, answers });
  }} />);
}

function deleteQuiz(quiz, run) {
  return confirm(`Delete ${quiz.title}? This removes quiz submissions and quiz JCoin transactions.`)
    && run(() => del(`/admin/quizzes/${quiz.id}`), "Quiz deleted");
}

function QuizActions({ quiz, data, run }) {
  return <div className="inline">
    <QuizFormModal data={data} run={run} quiz={quiz} />
    <button type="button" className="soft" onClick={() => printQuizPaper(quiz)}><Printer size={16} />Print / Save PDF</button>
    <button type="button" className="soft" onClick={() => printPaperQuizPack(quiz)}><Printer size={16} />Paper Types</button>
    <button type="button" className="soft" onClick={() => printBlankPaperSheet(quiz)}><Printer size={16} />Answer Sheet</button>
    <button type="button" className="soft" onClick={() => printDemoPaperSheet(quiz)}><Printer size={16} />Demo Sheet</button>
    <button type="button" className="soft" onClick={() => printQuizAnswerKey(quiz)}><FileCheck2 size={16} />Answer Key PDF</button>
    <PaperCheckModal quiz={quiz} run={run} />
    <PaperCheckModal quiz={quiz} run={run} scanner="v2" />
    <PaperCheckModal quiz={quiz} run={run} scanner="v3" />
    {quiz.status === "draft" && <button type="button" className="soft" onClick={() => run(() => post(`/admin/quizzes/${quiz.id}/publish`, {}), "Quiz published")}>Publish</button>}
    {quiz.status === "published" && <button type="button" className="soft" onClick={() => run(() => post(`/admin/quizzes/${quiz.id}/close`, {}), "Quiz closed")}>Close</button>}
    {quiz.status === "closed" && <button type="button" className="soft" onClick={() => run(() => post(`/admin/quizzes/${quiz.id}/publish`, {}), "Quiz reopened")}>Reopen</button>}
    <button type="button" className="danger" onClick={() => deleteQuiz(quiz, run)}>Delete</button>
  </div>;
}

function PaperCheckModal({ quiz, run, scanner = "v1" }) {
  const rows = paperQuizRows(quiz, "A");
  const isV2 = scanner === "v2";
  const isV3 = scanner === "v3";
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);
  const cropperRef = useRef(null);
  const [form, setForm] = useState({ studentCode: "", variant: "A", answersText: "" });
  const [source, setSource] = useState({ file: null, previewUrl: "", width: 0, height: 0 });
  const [crop, setCrop] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [showCropper, setShowCropper] = useState(false);
  const [scan, setScan] = useState({ loading: false, message: "", previewUrl: "", result: null });
  useEffect(() => () => {
    if (source.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(source.previewUrl);
  }, [source.previewUrl]);
  async function submit(event) {
    event.preventDefault();
    const answers = parsePaperAnswers(form.answersText);
    await run(() => post(`/admin/quizzes/${quiz.id}/paper-submissions`, {
      studentCode: form.studentCode,
      variant: form.variant,
      answers
    }), "Paper quiz checked");
  }
  async function chooseScanSource(file) {
    if (!file) return;
    if (source.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(source.previewUrl);
    setScan({ loading: false, message: "Preparing image preview...", previewUrl: "", result: null });
    const preview = await createScanPreview(file);
    setSource({ file, previewUrl: preview.url, width: preview.width, height: preview.height });
    setCrop({ top: 0, right: 0, bottom: 0, left: 0 });
    setShowCropper(true);
    setScan({ loading: false, message: "Crop the image so only the answer sheet is inside the box, then scan.", previewUrl: "", result: null });
  }
  async function scanCroppedSheet() {
    if (!source.file) return;
    setShowCropper(false);
    setScan({ loading: true, message: "Preparing cropped image...", previewUrl: "", result: null });
    const croppedFile = await cropImageFile(source.file, crop);
    await scanSheet(croppedFile);
  }
  function startCropDrag(handle, event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const update = (clientX, clientY) => {
      const rect = cropperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
      const y = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);
      setCrop((current) => {
        const next = { ...current };
        const minimum = 12;
        if (handle.includes("left")) next.left = clamp(x, 0, 100 - current.right - minimum);
        if (handle.includes("right")) next.right = clamp(100 - x, 0, 100 - current.left - minimum);
        if (handle.includes("top")) next.top = clamp(y, 0, 100 - current.bottom - minimum);
        if (handle.includes("bottom")) next.bottom = clamp(100 - y, 0, 100 - current.top - minimum);
        return next;
      });
    };
    update(event.clientX, event.clientY);
    const move = (moveEvent) => update(moveEvent.clientX, moveEvent.clientY);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }
  async function scanSheet(file) {
    if (!file) return;
    setScan({ loading: true, message: "Scanning answer sheet...", previewUrl: "", result: null });
    try {
      const result = isV3 ? await scanPaperAnswerSheetV3(quiz, file) : isV2 ? await scanPaperAnswerSheetV2(quiz, file) : await scanPaperAnswerSheet(quiz, file);
      const answersText = Object.entries(result.answers).map(([number, answer]) => `${number}${answer}`).join(" ");
      setForm({ studentCode: result.studentCode, variant: result.variant || "A", answersText });
      setScan({ loading: false, message: result.message, previewUrl: result.previewUrl || "", result });
    } catch (err) {
      setScan((current) => ({ ...current, loading: false, message: err.message, result: null }));
    }
  }
  const scannerLabel = isV3 ? "Check Paper V3" : isV2 ? "Check Paper V2" : "Check Paper";
  return <ActionModal title={`${scannerLabel} - ${quiz.title}`} buttonLabel={scannerLabel} icon={FileCheck2}>
    <form onSubmit={submit}>
      <div className="notice">Take a photo or upload an image, crop to the answer sheet, scan, then review before saving.</div>
      <div className="inline">
        <button type="button" className="soft" onClick={() => cameraInputRef.current?.click()}>Take Photo</button>
        <button type="button" className="soft" onClick={() => uploadInputRef.current?.click()}>Upload Image</button>
        <input ref={cameraInputRef} style={{ display: "none" }} type="file" accept="image/*" capture="environment" onChange={(event) => { chooseScanSource(event.target.files?.[0]); event.target.value = ""; }} />
        <input ref={uploadInputRef} style={{ display: "none" }} type="file" accept="image/*" onChange={(event) => { chooseScanSource(event.target.files?.[0]); event.target.value = ""; }} />
      </div>
      {source.previewUrl && !showCropper && <div className="inline">
        <button type="button" className="soft" onClick={() => setShowCropper(true)}>Show Cropper</button>
      </div>}
      {source.previewUrl && showCropper && <div className="paper-crop-workspace">
        <div className="paper-cropper" ref={cropperRef} style={source.width && source.height ? { aspectRatio: `${source.width} / ${source.height}` } : undefined}>
          <img src={source.previewUrl} alt="Answer sheet crop preview" />
          <div className="paper-crop-mask" style={{ inset: `${crop.top}% ${crop.right}% ${crop.bottom}% ${crop.left}%` }}>
            {["top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"].map((handle) => (
              <button key={handle} type="button" className={`paper-crop-handle ${handle}`} aria-label={`Drag ${handle} crop edge`} onPointerDown={(event) => startCropDrag(handle, event)} />
            ))}
          </div>
        </div>
        <p className="muted-line">Drag the crop edges so the four black corner squares are inside the box.</p>
        <div className="inline">
          <button type="button" className="soft" onClick={() => setCrop({ top: 0, right: 0, bottom: 0, left: 0 })}>Reset Crop</button>
          <button type="button" onClick={scanCroppedSheet} disabled={scan.loading}>{scan.loading ? "Scanning..." : "Scan Cropped Image"}</button>
        </div>
      </div>}
      {scan.previewUrl && <img className="paper-scan-preview" src={scan.previewUrl} alt="Scanned answer sheet preview" />}
      {scan.loading && <div className="notice paper-scan-loading">Scanning paper. Please wait...</div>}
      {scan.message && <p className="muted-line">{scan.message}</p>}
      <div className="form-grid two">
        <Field label="Student Code" value={form.studentCode} onChange={(studentCode) => setForm({ ...form, studentCode })} placeholder="JCS1234" />
        <Select label="Paper Type" value={form.variant} onChange={(variant) => setForm({ ...form, variant })} options={paperQuizVariants.map((variant) => ({ value: variant, label: `Type ${variant}` }))} />
      </div>
      <Field label={`Answers (${rows.length} items)`} value={form.answersText} onChange={(answersText) => setForm({ ...form, answersText })} placeholder="1A 2B 3C 4D" />
      {scan.result && <PaperScanReview result={scan.result} />}
      <button>Save Paper Score</button>
    </form>
  </ActionModal>;
}

function PaperScanReview({ result }) {
  const unanswered = result.rows.filter((row) => !result.answers[row.number]).length;
  return <div className="paper-scan-review">
    <div className="notice">Detected {result.studentCode || "no student code"} | Type {result.variant || "?"} | {result.rows.length - unanswered}/{result.rows.length} answers</div>
    {!!unanswered && <p className="error">{unanswered} item{unanswered === 1 ? "" : "s"} need manual review before saving.</p>}
  </div>;
}

function QuizCard({ quiz, data, run }) {
  return <Panel title={`${quiz.title} Results`} wide defaultOpen={false} actions={<div className="inline"><QuizFormModal data={data} run={run} quiz={quiz} /><button type="button" className="soft" onClick={() => printQuizPaper(quiz)}><Printer size={16} />Print / Save PDF</button><button type="button" className="soft" onClick={() => printPaperQuizPack(quiz)}><Printer size={16} />Paper Types</button><button type="button" className="soft" onClick={() => printBlankPaperSheet(quiz)}><Printer size={16} />Answer Sheet</button><button type="button" className="soft" onClick={() => printDemoPaperSheet(quiz)}><Printer size={16} />Demo Sheet</button><button type="button" className="soft" onClick={() => printQuizAnswerKey(quiz)}><FileCheck2 size={16} />Answer Key PDF</button><PaperCheckModal quiz={quiz} run={run} /><PaperCheckModal quiz={quiz} run={run} scanner="v2" /><PaperCheckModal quiz={quiz} run={run} scanner="v3" /><button type="button" className="danger" onClick={() => deleteQuiz(quiz, run)}>Delete Quiz</button></div>}>
    <p className="muted-line">{quiz.subjectName} | {quiz.section} | {quizTypesLabel(quiz)} | {quiz.timeLimitMinutes} minutes | passing {quiz.passingScore}/{quiz.questions.length} | reward {quiz.rewardValue} JC | reveal {revealLabel(quiz)}</p>
    <Table columns={["Student", "Code", "Attempts", "Latest", "Best Correct", "Best JCoins", "Submitted"]} rows={(quiz.rows || []).map((row) => [row.studentName, row.studentCode || "-", row.attempts, row.latestScore || "-", row.bestScore || "-", row.bestAwarded, row.submittedAt ? new Date(row.submittedAt).toLocaleString() : "-"])} />
  </Panel>;
}

function StudentQuizzes({ data, run }) {
  const [activeQuizId, setActiveQuizId] = useState("");
  const [activeAttempt, setActiveAttempt] = useState(null);
  const activeQuiz = useMemo(() => (data.quizzes || []).find((quiz) => quiz.id === activeQuizId), [data.quizzes, activeQuizId]);
  async function openQuiz(quiz) {
    if (!quiz.canSubmit || !quiz.timeLimitMinutes) {
      setActiveAttempt(quiz.submission?.activeAttempt || null);
      setActiveQuizId(quiz.id);
      return;
    }
    const result = await run(() => post(`/student/quizzes/${quiz.id}/start`, {}), "Quiz started");
    if (!result) return;
    setActiveAttempt(result.attempt);
    setActiveQuizId(quiz.id);
  }
  return <div className="dashboard-grid">
    <Panel title="My Quizzes" wide defaultOpen>
      <Table columns={["Quiz", "Subject", "Status", "Time", "Deadline", "Score", "JCoins", "Action"]} rows={(data.quizzes || []).map((quiz) => [
        quiz.title,
        quiz.subjectName,
        statusLabel(quiz.status),
        quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} min` : "Untimed",
        quiz.deadline,
        quiz.submission?.latest ? `${quiz.submission.latest.correct}/${quiz.submission.latest.total}` : "Not taken",
        quiz.submission?.bestAwarded ?? 0,
        <button type="button" className="soft" onClick={() => openQuiz(quiz)}>{quiz.canSubmit ? quiz.submission?.activeAttempt ? "Continue" : "Answer" : "View"}</button>
      ])} />
    </Panel>
    {activeQuiz && <StudentQuizPanel quiz={activeQuiz} attempt={activeAttempt || activeQuiz.submission?.activeAttempt} studentId={data.student?.id} run={run} onFinished={() => setActiveAttempt(null)} />}
  </div>;
}

function StudentQuizPanel({ quiz, attempt, studentId, run, onFinished }) {
  const answerStorageKey = quizAnswerStorageKey(studentId, quiz.id, attempt?.id);
  const [answers, setAnswers] = useState(() => readSavedQuizAnswers(answerStorageKey));
  const [remaining, setRemaining] = useState(() => secondsRemaining(attempt));
  const submittedRef = useRef(false);
  const showAnswers = quiz.submission?.showAnswers;
  async function submitQuiz() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const result = await run(() => post(`/student/quizzes/${quiz.id}/submit`, { answers, attemptId: attempt?.id || "" }), remaining <= 0 ? "Time ended; quiz submitted" : "Quiz submitted");
    if (!result) submittedRef.current = false;
    else {
      removeSavedQuizAnswers(answerStorageKey);
      onFinished();
    }
  }
  useEffect(() => {
    submittedRef.current = false;
    setAnswers(readSavedQuizAnswers(answerStorageKey));
    setRemaining(secondsRemaining(attempt));
    if (!attempt?.dueAt) return undefined;
    const timer = window.setInterval(() => setRemaining(secondsRemaining(attempt)), 1000);
    return () => window.clearInterval(timer);
  }, [attempt?.id, attempt?.dueAt, answerStorageKey]);
  useEffect(() => {
    saveQuizAnswers(answerStorageKey, answers);
  }, [answerStorageKey, answers]);
  useEffect(() => {
    if (attempt?.dueAt && remaining <= 0 && quiz.canSubmit) submitQuiz();
  }, [remaining, attempt?.dueAt, quiz.canSubmit]);
  return <Panel title={quiz.title} wide defaultOpen>
    <div className="quiz-session-head">
      <p className="muted-line">{quiz.subjectName} | {quiz.difficulty} | {quizTypesLabel(quiz)} | reward up to {quiz.rewardValue} JC | passing {quiz.passingScore}/{quiz.questions.length}</p>
      {attempt?.dueAt && <strong className={remaining <= 60 ? "quiz-timer warning" : "quiz-timer"}>{formatTimer(remaining)}</strong>}
    </div>
    {quiz.submission?.latest && <div className="notice">Latest score: {quiz.submission.latest.correct}/{quiz.submission.latest.total}. Best reward: {quiz.submission.bestAwarded} JCoins.</div>}
    {showAnswers && quiz.submission?.latest && <QuizAnswerReview questions={quiz.submission.reviewQuestions || []} attempt={quiz.submission.latest} />}
    <form className="quiz-answer-form" onSubmit={(event) => { event.preventDefault(); submitQuiz(); }}>
      {quiz.questions.map((question, index) => <section key={question.id} className="quiz-question-card">
        <strong>{index + 1}. {question.prompt}</strong>
        <StudentQuestionInput question={question} value={answers[question.id]} disabled={!quiz.canSubmit} showAnswers={false} onChange={(value) => setAnswers({ ...answers, [question.id]: value })} />
      </section>)}
      {quiz.canSubmit ? <button>Submit Quiz</button> : <p className="muted-line">This quiz is not open for a new submission.</p>}
    </form>
  </Panel>;
}

function QuizAnswerReview({ questions, attempt }) {
  if (!questions.length) return null;
  return <section className="quiz-review" aria-label="Quiz answer review">
    <h3>Answer Review</h3>
    <p className="muted-line">Compare your latest submitted answers with the correct answers.</p>
    {questions.map((question, index) => {
      const submitted = attempt.answers?.[question.id];
      const correct = reviewAnswerIsCorrect(question, submitted);
      return <article key={question.id} className={`quiz-review-card ${correct ? "is-correct" : "is-incorrect"}`}>
        <div className="quiz-review-heading">
          <strong>{index + 1}. {question.prompt}</strong>
          <span>{correct ? "Correct" : "Incorrect"}</span>
        </div>
        {question.type === "matching" ? <div className="quiz-review-matches">
          {(question.matchingItems || []).map((item) => <div key={item.id}>
            <strong>{item.text}</strong>
            <span>Your answer: {displayReviewAnswer(submitted?.[item.id])}</span>
            <span>Correct answer: {displayReviewAnswer(question.matchingAnswers?.[item.id])}</span>
          </div>)}
        </div> : <div className="quiz-review-answers">
          <div><small>Your answer</small><strong>{displayReviewAnswer(submitted)}</strong></div>
          <div><small>Correct answer</small><strong>{displayCorrectReviewAnswer(question)}</strong></div>
        </div>}
      </article>;
    })}
  </section>;
}

function displayReviewAnswer(value) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "No answer";
  const text = String(value ?? "").trim();
  return text || "No answer";
}

function displayCorrectReviewAnswer(question) {
  if (question.type === "multiple_select") return displayReviewAnswer(question.answers);
  if (question.type === "fill_blank") return displayReviewAnswer(question.acceptedAnswers);
  const tolerance = Number(question.tolerance || 0);
  return `${displayReviewAnswer(question.answer)}${tolerance > 0 ? ` (+/- ${tolerance})` : ""}`;
}

function reviewAnswerIsCorrect(question, submitted) {
  if (question.type === "fill_blank") {
    const value = normalizeReviewAnswer(submitted);
    return !!value && (question.acceptedAnswers || [question.answer]).some((answer) => normalizeReviewAnswer(answer) === value);
  }
  if (question.type === "multiple_select") {
    const expected = [...new Set(question.answers || [])].map(String).sort();
    const received = [...new Set(Array.isArray(submitted) ? submitted : [])].map(String).sort();
    return expected.length === received.length && expected.every((answer, index) => answer === received[index]);
  }
  if (question.type === "matching") {
    return (question.matchingItems || []).every((item) => String(submitted?.[item.id] || "") === String(question.matchingAnswers?.[item.id] || ""));
  }
  if (["numerical", "computation"].includes(question.type)) {
    const received = Number(String(submitted ?? "").replaceAll(",", ""));
    return Number.isFinite(received) && Math.abs(received - Number(question.answer)) <= Number(question.tolerance || 0);
  }
  return String(submitted ?? "") === String(question.answer ?? "");
}

function normalizeReviewAnswer(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function quizAnswerStorageKey(studentId, quizId, attemptId) {
  return `jcoins:quiz-answers:${studentId || "student"}:${quizId}:${attemptId || "untimed"}`;
}

function readSavedQuizAnswers(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

function saveQuizAnswers(key, answers) {
  try {
    localStorage.setItem(key, JSON.stringify(answers || {}));
  } catch {
    // Quiz answering must continue even when browser storage is unavailable.
  }
}

function removeSavedQuizAnswers(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing else is required after a successful server submission.
  }
}

function StudentQuestionInput({ question, value, disabled, showAnswers, onChange }) {
  if (["multiple_choice", "true_false"].includes(question.type)) return <div className="quiz-options">
    {question.options.map((option) => <label key={option} className={`check ${showAnswers && option === question.answer ? "correct-answer" : ""}`}>
      <input type="radio" name={question.id} value={option} checked={value === option} disabled={disabled} onChange={() => onChange(option)} />
      {option}
    </label>)}
  </div>;
  if (question.type === "multiple_select") return <div className="quiz-options">
    {question.options.map((option) => <label key={option} className={`check ${showAnswers && (question.answers || []).includes(option) ? "correct-answer" : ""}`}>
      <input type="checkbox" checked={(value || []).includes(option)} disabled={disabled} onChange={(event) => onChange(event.target.checked ? [...(value || []), option] : (value || []).filter((answer) => answer !== option))} />
      {option}
    </label>)}
  </div>;
  if (question.type === "matching") return <div className="quiz-student-matching">
    {(question.matchingItems || []).map((item) => <label key={item.id}>
      <span>{item.text}</span>
      <select value={value?.[item.id] || ""} disabled={disabled} onChange={(event) => onChange({ ...(value || {}), [item.id]: event.target.value })}>
        <option value="">Choose match</option>
        {question.options.map((option, optionIndex) => <option value={option} key={`${option}-${optionIndex}`}>{option}</option>)}
      </select>
      {showAnswers && <small>Correct: {question.matchingAnswers?.[item.id]}</small>}
    </label>)}
  </div>;
  if (question.type === "fill_blank") return <div className="quiz-written-answer">
    <input value={value || ""} disabled={disabled} placeholder="Type your answer" onChange={(event) => onChange(event.target.value)} />
    {showAnswers && <small>Accepted: {(question.acceptedAnswers || []).join(" / ")}</small>}
  </div>;
  return <div className="quiz-written-answer">
    <input type="number" step="any" value={value ?? ""} disabled={disabled} placeholder="Enter final answer" onChange={(event) => onChange(event.target.value)} />
    {showAnswers && <small>Correct: {question.answer}{Number(question.tolerance || 0) > 0 ? ` (+/- ${question.tolerance})` : ""}</small>}
  </div>;
}

function cleanQuizForm(form) {
  const quizTypes = selectedQuizTypes(form);
  return {
    ...form,
    quizTypes,
    quizType: quizTypes.length === 1 ? quizTypes[0] : "mixed",
    passingScore: Number(form.passingScore || 1),
    timeLimitMinutes: Number(form.timeLimitMinutes || 30),
    questions: form.questions.map(cleanQuestionForSubmit)
  };
}

function cleanQuestionForSubmit(question) {
  const cleaned = { ...question, prompt: String(question.prompt || "").trim() };
  if (question.type === "true_false") return { ...cleaned, options: ["True", "False"], answer: String(question.answer || "True") };
  if (["multiple_choice", "multiple_select"].includes(question.type)) {
    const options = question.options.map((option) => String(option || "").trim()).filter(Boolean);
    return { ...cleaned, options, answer: question.type === "multiple_choice" ? String(question.answer || "").trim() : undefined, answers: question.type === "multiple_select" ? (question.answers || []).map((answer) => String(answer).trim()).filter(Boolean) : undefined };
  }
  if (question.type === "fill_blank") return { ...cleaned, options: [], acceptedAnswers: (question.acceptedAnswers || []).map((answer) => String(answer).trim()).filter(Boolean) };
  if (question.type === "matching") return { ...cleaned, options: [], matchingPairs: (question.matchingPairs || []).map((pair) => ({ ...pair, left: String(pair.left || "").trim(), right: String(pair.right || "").trim() })).filter((pair) => pair.left && pair.right) };
  return { ...cleaned, options: [], answer: String(question.answer ?? "").trim(), tolerance: Number(question.tolerance || 0) };
}

function cloneQuestion(question) {
  return {
    ...question,
    options: [...(question.options || [])],
    answers: [...(question.answers || [])],
    acceptedAnswers: [...(question.acceptedAnswers || [])],
    matchingPairs: (question.matchingPairs || []).map((pair) => ({ ...pair }))
  };
}

function convertQuestionType(question, type) {
  return { ...blankQuestion(type), id: question.id, prompt: question.prompt };
}

function secondsRemaining(attempt) {
  if (!attempt?.dueAt) return 0;
  return Math.max(0, Math.ceil((new Date(attempt.dueAt).getTime() - Date.now()) / 1000));
}

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function studentsForQuiz(data, form) {
  return (data.students || []).filter((student) => student.section === form.section && (student.subjectIds || []).includes(form.subjectId));
}

function quizSectionsForSubject(data, subjectId) {
  return [...new Set((data.students || [])
    .filter((student) => (student.subjectIds || []).includes(subjectId) && student.section)
    .map((student) => student.section))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function preferredQuizSection(data, subjectId, currentSection = "") {
  const sections = quizSectionsForSubject(data, subjectId);
  return sections.includes(currentSection) ? currentSection : sections[0] || "";
}

function statusLabel(status) {
  return { draft: "Draft", published: "Published", closed: "Closed" }[status] || status;
}

function quizTypeLabel(type) {
  return quizTypeOptions.find((option) => option.value === type)?.label || "Mixed Question Types";
}

function selectedQuizTypes(form) {
  const selected = Array.isArray(form.quizTypes) ? form.quizTypes.filter((type) => questionTypeOptions.some((option) => option.value === type)) : [];
  if (selected.length) return [...new Set(selected)];
  return quizTypesForQuiz(form);
}

function quizTypesForQuiz(quiz) {
  const stored = Array.isArray(quiz.quizTypes) ? quiz.quizTypes.filter((type) => questionTypeOptions.some((option) => option.value === type)) : [];
  if (stored.length) return [...new Set(stored)];
  const fromQuestions = [...new Set((quiz.questions || []).map((question) => question.type).filter((type) => questionTypeOptions.some((option) => option.value === type)))];
  if (fromQuestions.length) return fromQuestions;
  if (questionTypeOptions.some((option) => option.value === quiz.quizType)) return [quiz.quizType];
  return ["multiple_choice"];
}

function quizTypesLabel(quiz) {
  return quizTypesForQuiz(quiz).map((type) => quizTypeLabel(type)).join(", ");
}

function stableHash32(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicShuffle(items, seed) {
  return [...items].map((item, index) => ({
    item,
    key: stableHash32(`${seed}:${index}:${JSON.stringify(item)}`)
  })).sort((a, b) => a.key - b.key).map((entry) => entry.item);
}

function normalizePaperVariant(value) {
  const variant = String(value || "A").trim().toUpperCase();
  return paperQuizVariants.includes(variant) ? variant : "A";
}

function paperQuizRows(quiz, variantInput = "A") {
  const variant = normalizePaperVariant(variantInput);
  const seedBase = `${quiz.id}:${quiz.currentVersionId || ""}:${variant}`;
  const rows = [];
  (quiz.questions || []).forEach((question, questionIndex) => {
    if (!paperQuizTypes.includes(question.type)) return;
    if (["multiple_choice", "true_false"].includes(question.type)) {
      const choices = question.type === "true_false"
        ? ["True", "False"]
        : deterministicShuffle(question.options || [], `${seedBase}:options:${question.id}`);
      rows.push({
        questionId: question.id,
        sourceQuestionIndex: questionIndex,
        type: question.type,
        prompt: question.prompt,
        choices,
        correctText: question.answer
      });
      return;
    }
    const pairs = question.matchingPairs || [];
    const choices = deterministicShuffle([...new Set(pairs.map((pair) => pair.right).filter(Boolean))], `${seedBase}:matching:${question.id}`);
    pairs.forEach((pair, pairIndex) => {
      rows.push({
        questionId: question.id,
        pairId: pair.id,
        sourceQuestionIndex: questionIndex,
        sourcePairIndex: pairIndex,
        type: "matching",
        prompt: `${question.prompt}\n${pair.left}`,
        choices,
        correctText: pair.right
      });
    });
  });
  return deterministicShuffle(rows, `${seedBase}:questions`).map((row, index) => {
    const choices = (row.choices || []).slice(0, 26);
    const correctIndex = choices.findIndex((choice) => String(choice) === String(row.correctText));
    return {
      ...row,
      number: index + 1,
      choices,
      correctLetter: correctIndex >= 0 ? String.fromCharCode(65 + correctIndex) : ""
    };
  });
}

function parsePaperAnswers(text) {
  const answers = {};
  String(text || "").toUpperCase().match(/\d+\s*[:.)-]?\s*[A-Z]/g)?.forEach((token) => {
    const match = token.match(/(\d+)\D*([A-Z])/);
    if (match) answers[match[1]] = match[2];
  });
  return answers;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function paperSheetLayout(rows) {
  const codeX = [145, 255, 365, 475];
  const codeY = Array.from({ length: 10 }, (_, value) => 292 + value * 28);
  const typeX = [165, 240, 315, 390];
  const answerStartY = 705;
  const answerEndY = 1315;
  const rowsPerColumn = Math.ceil(rows.length / 2);
  const answerGap = Math.min(28, rowsPerColumn > 1 ? (answerEndY - answerStartY) / (rowsPerColumn - 1) : 28);
  return {
    code: codeX.map((x) => codeY.map((y, value) => ({ x, y, value: String(value) }))),
    type: paperQuizVariants.map((value, index) => ({ x: typeX[index], y: 630, value })),
    answers: rows.map((row, index) => {
      const column = index >= rowsPerColumn ? 1 : 0;
      const rowIndex = column ? index - rowsPerColumn : index;
      const baseX = column ? 590 : 145;
      const choiceGap = row.choices.length <= 4 ? 56 : clamp(230 / Math.max(1, row.choices.length - 1), 28, 44);
      const y = answerStartY + rowIndex * answerGap;
      return {
        number: row.number,
        labelX: baseX - 25,
        y,
        choices: row.choices.map((_, choiceIndex) => ({ x: baseX + choiceIndex * choiceGap, y, value: String.fromCharCode(65 + choiceIndex) }))
      };
    })
  };
}

function paperScanZones() {
  return {
    code: zoneMarkers(30, 262, 530, 602),
    type: zoneMarkers(30, 606, 440, 676),
    answersLeft: zoneMarkers(30, 676, 430, 1344),
    answersRight: zoneMarkers(540, 676, 850, 1344)
  };
}

function zoneMarkers(left, top, right, bottom) {
  return {
    tl: { x: left, y: top },
    tr: { x: right, y: top },
    bl: { x: left, y: bottom },
    br: { x: right, y: bottom },
    bounds: { left, top, right, bottom }
  };
}

async function scanPaperAnswerSheet(quiz, file) {
  const image = await loadImageFromFile(file);
  const maxWidth = 1200;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const page = detectPaperPage(imageData, canvas.width, canvas.height);
  const previewUrl = canvas.toDataURL("image/jpeg", 0.72);
  const firstRows = paperQuizRows(quiz, "A");
  const firstLayout = paperSheetLayout(firstRows);
  const codeDigits = firstLayout.code.map((column) => readBubbleGroup(imageData, canvas.width, canvas.height, page, column, {
    minRatio: 0.42,
    minGap: 0.1,
    strongRatio: 0.68,
    strongGap: 0.055,
    radiusScale: 2.4,
    searchScale: 0.75,
    stepScale: 0.75
  }).value || "").join("");
  const typeRead = readBubbleGroup(imageData, canvas.width, canvas.height, page, firstLayout.type).value || "A";
  const rows = paperQuizRows(quiz, typeRead);
  const layout = paperSheetLayout(rows);
  const answers = {};
  layout.answers.forEach((row) => {
    const read = readBubbleGroup(imageData, canvas.width, canvas.height, page, row.choices);
    if (read.value) answers[row.number] = read.value;
  });
  const missingCode = codeDigits.length !== 4;
  const answered = Object.keys(answers).length;
  return {
    studentCode: missingCode ? "" : `JCS${codeDigits}`,
    variant: typeRead,
    answers,
    rows,
    usedMarkers: page.usedMarkers,
    previewUrl,
    message: `${page.usedMarkers ? "Scan markers found." : "Using image edges; crop the answer sheet if detection is off."} Detected ${missingCode ? "no complete code" : `JCS${codeDigits}`}, Type ${typeRead}, and ${answered}/${rows.length} answers. Review before saving.`
  };
}

async function scanPaperAnswerSheetV2(quiz, file) {
  const image = await loadImageFromFile(file);
  const maxWidth = 1200;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const page = detectPaperPage(imageData, canvas.width, canvas.height);
  const previewUrl = canvas.toDataURL("image/jpeg", 0.72);
  const firstRows = paperQuizRows(quiz, "A");
  const firstLayout = paperSheetLayout(firstRows);
  const codeDigits = firstLayout.code.map((column) => readBubbleGroupV2(imageData, canvas.width, canvas.height, page, column, {
    minRatio: 0.24,
    minGap: 0.02,
    strongRatio: 0.52,
    strongGap: 0.018,
    radiusScale: 2.15,
    searchScale: 4.2
  }).value || "").join("");
  const typeRead = readBubbleGroupV2(imageData, canvas.width, canvas.height, page, firstLayout.type, {
    minRatio: 0.34,
    minGap: 0.055,
    radiusScale: 2.8,
    searchScale: 3
  }).value || "A";
  const rows = paperQuizRows(quiz, typeRead);
  const layout = paperSheetLayout(rows);
  const answers = {};
  layout.answers.forEach((row) => {
    const read = readBubbleGroupV2(imageData, canvas.width, canvas.height, page, row.choices, {
      minRatio: 0.58,
      minGap: 0.2,
      strongRatio: 0.86,
      strongGap: 0.13,
      radiusScale: 2.35,
      searchScale: 1.25
    });
    if (read.value) answers[row.number] = read.value;
  });
  const missingCode = codeDigits.length !== 4;
  const answered = Object.keys(answers).length;
  return {
    studentCode: missingCode ? "" : `JCS${codeDigits}`,
    variant: typeRead,
    answers,
    rows,
    usedMarkers: page.usedMarkers,
    previewUrl,
    message: `${page.usedMarkers ? "V2 scan markers found." : "V2 using image edges; crop tighter if detection is off."} Detected ${missingCode ? "no complete code" : `JCS${codeDigits}`}, Type ${typeRead}, and ${answered}/${rows.length} answers. Review before saving.`
  };
}

async function scanPaperAnswerSheetV3(quiz, file) {
  const image = await loadImageFromFile(file);
  const maxWidth = 1200;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const page = detectPaperPage(imageData, canvas.width, canvas.height);
  const previewUrl = canvas.toDataURL("image/jpeg", 0.72);
  const markerCandidates = findMarkerCandidates(imageData, canvas.width, canvas.height, 180);
  const zones = paperScanZones();
  const zonePages = Object.fromEntries(Object.entries(zones).map(([key, zone]) => [key, detectZonePage(page, zone, markerCandidates)]));
  const firstRows = paperQuizRows(quiz, "A");
  const firstLayout = paperSheetLayout(firstRows);
  const codePage = zonePages.code || page;
  const typePage = zonePages.type || page;
  const codeDigits = firstLayout.code.map((column) => readBubbleGroupV3(imageData, canvas.width, canvas.height, codePage, column, {
    minRatio: 0.24,
    minGap: 0.02,
    strongRatio: 0.52,
    strongGap: 0.018,
    radiusScale: 2.15,
    searchScale: 4.6
  }).value || "").join("");
  const typeRead = readBubbleGroupV3(imageData, canvas.width, canvas.height, typePage, firstLayout.type, {
    minRatio: 0.36,
    minGap: 0.08,
    radiusScale: 2.8,
    searchScale: 4.2
  }).value || "A";
  const rows = paperQuizRows(quiz, typeRead);
  const layout = paperSheetLayout(rows);
  const rowsPerColumn = Math.ceil(rows.length / 2);
  const answers = {};
  layout.answers.forEach((row, index) => {
    const answerPage = index >= rowsPerColumn ? (zonePages.answersRight || page) : (zonePages.answersLeft || page);
    const read = readBubbleGroupV3(imageData, canvas.width, canvas.height, answerPage, row.choices, {
      minRatio: 0.46,
      minGap: 0.12,
      strongRatio: 0.78,
      strongGap: 0.09,
      radiusScale: 2.45,
      searchScale: 4.4
    });
    if (read.value) answers[row.number] = read.value;
  });
  const missingCode = codeDigits.length !== 4;
  const answered = Object.keys(answers).length;
  const zoneCount = Object.values(zonePages).filter(Boolean).length;
  return {
    studentCode: missingCode ? "" : `JCS${codeDigits}`,
    variant: typeRead,
    answers,
    rows,
    usedMarkers: page.usedMarkers,
    previewUrl,
    message: `V3 combined scan ${page.usedMarkers ? "page markers found" : "using image edges"}; ${zoneCount}/4 section marker groups found. Detected ${missingCode ? "no complete code" : `JCS${codeDigits}`}, Type ${typeRead}, and ${answered}/${rows.length} answers. Review before saving.`
  };
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
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

async function createScanPreview(file) {
  const image = await loadImageFromFile(file);
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  return { url: canvas.toDataURL("image/jpeg", 0.82), width, height };
}

async function cropImageFile(file, crop) {
  const image = await loadImageFromFile(file);
  const left = Math.min(80, Math.max(0, Number(crop.left || 0)));
  const right = Math.min(80, Math.max(0, Number(crop.right || 0)));
  const top = Math.min(80, Math.max(0, Number(crop.top || 0)));
  const bottom = Math.min(80, Math.max(0, Number(crop.bottom || 0)));
  const sx = Math.round(image.naturalWidth * (left / 100));
  const sy = Math.round(image.naturalHeight * (top / 100));
  const sw = Math.max(1, Math.round(image.naturalWidth * ((100 - left - right) / 100)));
  const sh = Math.max(1, Math.round(image.naturalHeight * ((100 - top - bottom) / 100)));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext("2d");
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.92);
  });
}

function detectPaperPage(imageData, width, height) {
  const regionMarkers = {
    tl: findMarkerInRegion(imageData, width, height, 0, 0, width * 0.22, height * 0.18, "tl"),
    tr: findMarkerInRegion(imageData, width, height, width * 0.78, 0, width, height * 0.18, "tr"),
    bl: findMarkerInRegion(imageData, width, height, 0, height * 0.82, width * 0.22, height, "bl"),
    br: findMarkerInRegion(imageData, width, height, width * 0.78, height * 0.82, width, height, "br")
  };
  const regionPage = pageFromPaperMarkers(regionMarkers);
  if (regionPage) return regionPage;
  const globalPage = pageFromPaperMarkers(findPaperMarkers(imageData, width, height));
  if (globalPage) return globalPage;
  return { x: 0, y: 0, scaleX: width / 1000, scaleY: height / 1414, unitScale: Math.min(width / 1000, height / 1414), usedMarkers: false };
}

function pageFromPaperMarkers(markers, logicalBounds = paperScanMarkerBounds, options = {}) {
  if (!markers || !["tl", "tr", "bl", "br"].every((corner) => markers[corner])) return null;
  const { tl, tr, bl, br } = markers;
  if (![tl, tr, bl, br].every((marker) => Number.isFinite(marker.x) && Number.isFinite(marker.y))) return null;
  const topWidth = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const bottomWidth = Math.hypot(br.x - bl.x, br.y - bl.y);
  const leftHeight = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const rightHeight = Math.hypot(br.x - tr.x, br.y - tr.y);
  const pageWidth = (topWidth + bottomWidth) / 2;
  const pageHeight = (leftHeight + rightHeight) / 2;
  if (pageWidth < (options.minWidth || 120) || pageHeight < (options.minHeight || 180)) return null;
  if (!options.allowFlat && pageHeight / Math.max(1, pageWidth) < 1.1) return null;
  const widthSkew = Math.abs(topWidth - bottomWidth) / Math.max(topWidth, bottomWidth);
  const heightSkew = Math.abs(leftHeight - rightHeight) / Math.max(leftHeight, rightHeight);
  if (widthSkew > 0.42 || heightSkew > 0.42) return null;
  const markerLeft = logicalBounds.left;
  const markerTop = logicalBounds.top;
  const markerRight = logicalBounds.right;
  const markerBottom = logicalBounds.bottom;
  const scaleX = pageWidth / (markerRight - markerLeft);
  const scaleY = pageHeight / (markerBottom - markerTop);
  return {
    x: Math.min(tl.x, bl.x) - markerLeft * scaleX,
    y: Math.min(tl.y, tr.y) - markerTop * scaleY,
    scaleX,
    scaleY,
    unitScale: Math.min(scaleX, scaleY),
    corners: markers,
    logicalBounds: { left: markerLeft, top: markerTop, right: markerRight, bottom: markerBottom },
    usedMarkers: true
  };
}

function detectZonePage(basePage, zone, candidates) {
  if (!basePage || !zone || !candidates?.length) return null;
  const markers = {};
  for (const corner of ["tl", "tr", "bl", "br"]) {
    if (!zone[corner]) return null;
    const expected = mapPaperPoint(basePage, zone[corner].x, zone[corner].y);
    if (!expected) return null;
    const maxDistance = Math.max(14, (basePage.unitScale || Math.min(basePage.scaleX, basePage.scaleY)) * 38);
    const match = candidates
      .map((candidate) => ({ ...candidate, distance: Math.hypot(candidate.x - expected.x, candidate.y - expected.y) }))
      .filter((candidate) => candidate.distance <= maxDistance)
      .sort((a, b) => (a.distance / Math.max(1, a.side)) - (b.distance / Math.max(1, b.side)))[0];
    if (match) markers[corner] = match;
  }
  return pageFromPaperMarkers(markers, zone.bounds, { minWidth: 24, minHeight: 18, allowFlat: true });
}

function findPaperMarkers(imageData, width, height) {
  const candidates = findMarkerCandidates(imageData, width, height);
  if (candidates.length < 4) return null;
  const distinct = (picked) => {
    const minimumGap = Math.min(width, height) * 0.08;
    return [...picked].every((marker, index, list) => list.slice(index + 1).every((other) => Math.hypot(marker.x - other.x, marker.y - other.y) > minimumGap));
  };
  const sorted = {
    tl: [...candidates].sort((a, b) => (a.x + a.y) - (b.x + b.y)),
    tr: [...candidates].sort((a, b) => (b.x - b.y) - (a.x - a.y)),
    bl: [...candidates].sort((a, b) => (b.y - b.x) - (a.y - a.x)),
    br: [...candidates].sort((a, b) => (b.x + b.y) - (a.x + a.y))
  };
  let best = null;
  const limit = 16;
  sorted.tl.slice(0, limit).forEach((tl) => {
    sorted.tr.slice(0, limit).forEach((tr) => {
      sorted.bl.slice(0, limit).forEach((bl) => {
        sorted.br.slice(0, limit).forEach((br) => {
          const markers = { tl, tr, bl, br };
          if (!distinct([tl, tr, bl, br])) return;
          const page = pageFromPaperMarkers(markers);
          if (!page) return;
          const top = Math.hypot(tr.x - tl.x, tr.y - tl.y);
          const bottom = Math.hypot(br.x - bl.x, br.y - bl.y);
          const left = Math.hypot(bl.x - tl.x, bl.y - tl.y);
          const right = Math.hypot(br.x - tr.x, br.y - tr.y);
          const markerSides = [tl.side, tr.side, bl.side, br.side];
          const averageSide = markerSides.reduce((sum, side) => sum + side, 0) / markerSides.length;
          const sidePenalty = markerSides.reduce((sum, side) => sum + Math.abs(side - averageSide) / Math.max(1, averageSide), 0);
          const shapePenalty = Math.abs(top - bottom) / Math.max(top, bottom) + Math.abs(left - right) / Math.max(left, right);
          const area = ((top + bottom) / 2) * ((left + right) / 2);
          const score = area - shapePenalty * area * 0.55 - sidePenalty * area * 0.08 + (tl.score + tr.score + bl.score + br.score) * 12;
          if (!best || score > best.score) best = { markers, score };
        });
      });
    });
  });
  return best?.markers || null;
}

function findMarkerCandidates(imageData, width, height, limit = 80) {
  const visited = new Uint8Array(width * height);
  const data = imageData.data;
  const isDarkAt = (x, y) => {
    const offset = (y * width + x) * 4;
    return data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114 < 155;
  };
  const candidates = [];
  const minSide = Math.max(5, Math.min(width, height) * 0.004);
  const maxSide = Math.max(30, Math.min(width, height) * 0.085);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIndex = y * width + x;
      if (visited[startIndex] || !isDarkAt(x, y)) continue;
      const stack = [[x, y]];
      visited[startIndex] = 1;
      let count = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        count += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
          const index = ny * width + nx;
          if (!visited[index] && isDarkAt(nx, ny)) {
            visited[index] = 1;
            stack.push([nx, ny]);
          }
        });
      }
      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const fill = count / Math.max(1, boxWidth * boxHeight);
      const ratio = boxWidth / Math.max(1, boxHeight);
      const side = (boxWidth + boxHeight) / 2;
      if (count < 18 || side < minSide || side > maxSide || fill < 0.16 || ratio < 0.38 || ratio > 2.65) continue;
      candidates.push({
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        score: count * fill * (1 - Math.min(0.8, Math.abs(1 - ratio) * 0.25)),
        side
      });
    }
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
}

function findMarkerInRegion(imageData, width, height, rx0, ry0, rx1, ry1, corner) {
  const x0 = Math.max(0, Math.floor(rx0));
  const y0 = Math.max(0, Math.floor(ry0));
  const x1 = Math.min(width, Math.ceil(rx1));
  const y1 = Math.min(height, Math.ceil(ry1));
  const regionWidth = x1 - x0;
  const regionHeight = y1 - y0;
  const visited = new Uint8Array(Math.max(1, regionWidth * regionHeight));
  const data = imageData.data;
  const isDarkAt = (x, y) => {
    const offset = (y * width + x) * 4;
    return data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114 < 125;
  };
  const cornerPoint = {
    tl: [x0, y0],
    tr: [x1, y0],
    bl: [x0, y1],
    br: [x1, y1]
  }[corner];
  let best = null;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const startIndex = (y - y0) * regionWidth + (x - x0);
      if (visited[startIndex] || !isDarkAt(x, y)) continue;
      const stack = [[x, y]];
      visited[startIndex] = 1;
      let count = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        count += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) return;
          const index = (ny - y0) * regionWidth + (nx - x0);
          if (!visited[index] && isDarkAt(nx, ny)) {
            visited[index] = 1;
            stack.push([nx, ny]);
          }
        });
      }
      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const fill = count / Math.max(1, boxWidth * boxHeight);
      const ratio = boxWidth / Math.max(1, boxHeight);
      const minSide = Math.max(8, Math.min(width, height) * 0.01);
      const maxSide = Math.max(minSide * 2, Math.min(regionWidth, regionHeight) * 0.45);
      if (count < 50 || boxWidth < minSide || boxHeight < minSide || boxWidth > maxSide || boxHeight > maxSide || fill < 0.2 || ratio < 0.45 || ratio > 2.2) continue;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const distance = Math.hypot(cx - cornerPoint[0], cy - cornerPoint[1]);
      const score = count / Math.max(1, distance);
      if (!best || score > best.score) best = { x: cx, y: cy, score };
    }
  }
  return best;
}

function readBubbleGroup(imageData, width, height, page, bubbles, options = {}) {
  const reads = bubbles.map((bubble) => ({ ...bubble, ratio: bubbleDarkness(imageData, width, height, page, bubble, options) }))
    .sort((a, b) => b.ratio - a.ratio);
  const [best, second] = reads;
  if (!best) return { value: "", confidence: 0 };
  const gap = best.ratio - (second?.ratio || 0);
  const minRatio = options.minRatio ?? 0.54;
  const minGap = options.minGap ?? 0.18;
  const strongRatio = options.strongRatio ?? 0.78;
  const strongGap = options.strongGap ?? 0.1;
  const confident = best.ratio >= minRatio && (gap >= minGap || (best.ratio >= strongRatio && gap >= strongGap));
  return { value: confident ? best.value : "", confidence: gap, ratio: best.ratio };
}

function readBubbleGroupV2(imageData, width, height, page, bubbles, options = {}) {
  const reads = bubbles.map((bubble) => ({
    ...bubble,
    ratio: bubbleInkScoreV2(imageData, width, height, page, bubble, options)
  })).sort((a, b) => b.ratio - a.ratio);
  const [best, second] = reads;
  if (!best) return { value: "", confidence: 0 };
  const gap = best.ratio - (second?.ratio || 0);
  const minRatio = options.minRatio ?? 0.3;
  const minGap = options.minGap ?? 0.045;
  const strongRatio = options.strongRatio ?? 0.62;
  const strongGap = options.strongGap ?? minGap;
  const confident = best.ratio >= minRatio && (gap >= minGap || (best.ratio >= strongRatio && gap >= strongGap));
  return { value: confident ? best.value : "", confidence: gap, ratio: best.ratio };
}

function readBubbleGroupV3(imageData, width, height, page, bubbles, options = {}) {
  const reads = bubbles.map((bubble) => {
    const ink = bubbleInkScoreV2(imageData, width, height, page, bubble, options);
    const fill = bubbleDarkness(imageData, width, height, page, bubble, {
      ...options,
      radiusScale: (options.radiusScale ?? 2.6) * 0.9,
      searchScale: (options.searchScale ?? 3.4) * 0.75
    });
    return {
      ...bubble,
      ink,
      fill,
      ratio: ink * 0.62 + fill * 0.38
    };
  }).sort((a, b) => b.ratio - a.ratio);
  const [best, second] = reads;
  if (!best) return { value: "", confidence: 0 };
  const gap = best.ratio - (second?.ratio || 0);
  const inkGap = best.ink - (second?.ink || 0);
  const fillGap = best.fill - (second?.fill || 0);
  const minRatio = options.minRatio ?? 0.36;
  const minGap = options.minGap ?? 0.08;
  const strongRatio = options.strongRatio ?? 0.68;
  const strongGap = options.strongGap ?? minGap;
  const agreementGap = Math.min(inkGap, fillGap);
  const confident = best.ratio >= minRatio
    && (gap >= minGap || (best.ratio >= strongRatio && gap >= strongGap))
    && (agreementGap >= minGap * 0.35 || best.ratio >= strongRatio);
  return { value: confident ? best.value : "", confidence: gap, ratio: best.ratio, ink: best.ink, fill: best.fill };
}

function bubbleInkScoreV2(imageData, width, height, page, bubble, options = {}) {
  const point = mapPaperPoint(page, bubble.x, bubble.y);
  if (!point) return 0;
  const unitScale = page.unitScale || Math.min(page.scaleX, page.scaleY);
  const radius = Math.max(2, Math.round(unitScale * (options.radiusScale ?? 2.6)));
  const search = Math.max(1, Math.round(unitScale * (options.searchScale ?? 3.4)));
  const step = Math.max(1, Math.round(unitScale * 0.8));
  let bestScore = 0;
  for (let dy = -search; dy <= search; dy += step) {
    for (let dx = -search; dx <= search; dx += step) {
      const center = bubbleInkScoreAt(imageData, width, height, Math.round(point.x + dx), Math.round(point.y + dy), radius);
      bestScore = Math.max(bestScore, center);
    }
  }
  return bestScore;
}

function bubbleInkScoreAt(imageData, width, height, cx, cy, radius) {
  const data = imageData.data;
  let veryDark = 0;
  let dark = 0;
  let total = 0;
  let centerDark = 0;
  let centerTotal = 0;
  const centerRadius = Math.max(1, Math.round(radius * 0.55));
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      if (x < 0 || x >= width || y < 0 || y >= height || distance > radius) continue;
      const offset = (y * width + x) * 4;
      const lum = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
      if (lum < 120) veryDark += 1;
      if (lum < 170) dark += 1;
      if (distance <= centerRadius) {
        centerTotal += 1;
        if (lum < 165) centerDark += 1;
      }
      total += 1;
    }
  }
  if (!total || !centerTotal) return 0;
  return (veryDark / total) * 0.35 + (dark / total) * 0.25 + (centerDark / centerTotal) * 0.4;
}

function bubbleDarkness(imageData, width, height, page, bubble, options = {}) {
  const point = mapPaperPoint(page, bubble.x, bubble.y);
  if (!point) return 0;
  const unitScale = page.unitScale || Math.min(page.scaleX, page.scaleY);
  const radius = Math.max(2, Math.round(unitScale * (options.radiusScale ?? 3.25)));
  const search = Math.max(0, Math.round(unitScale * (options.searchScale ?? 2)));
  const step = Math.max(1, Math.round(unitScale * (options.stepScale ?? 1)));
  let bestRatio = 0;
  for (let dy = -search; dy <= search; dy += step) {
    for (let dx = -search; dx <= search; dx += step) {
      bestRatio = Math.max(bestRatio, bubbleDarknessAt(imageData, width, height, Math.round(point.x + dx), Math.round(point.y + dy), radius));
    }
  }
  return bestRatio;
}

function bubbleDarknessAt(imageData, width, height, cx, cy, radius) {
  const data = imageData.data;
  let dark = 0;
  let total = 0;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (x < 0 || x >= width || y < 0 || y >= height || Math.hypot(x - cx, y - cy) > radius) continue;
      const offset = (y * width + x) * 4;
      const lum = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
      if (lum < 150) dark += 1;
      total += 1;
    }
  }
  return total ? dark / total : 0;
}

function mapPaperPoint(page, x, y) {
  if (!page || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (![page.x, page.y, page.scaleX, page.scaleY].every(Number.isFinite)) return null;
  if (!page.corners || !page.logicalBounds) return {
    x: page.x + x * page.scaleX,
    y: page.y + y * page.scaleY
  };
  const { left, top, right, bottom } = page.logicalBounds;
  if (![left, top, right, bottom].every(Number.isFinite) || right === left || bottom === top) return null;
  const u = (x - left) / (right - left);
  const v = (y - top) / (bottom - top);
  const { tl, tr, bl, br } = page.corners;
  if (![tl, tr, bl, br].every((corner) => corner && Number.isFinite(corner.x) && Number.isFinite(corner.y))) return null;
  return {
    x: tl.x * (1 - u) * (1 - v) + tr.x * u * (1 - v) + bl.x * (1 - u) * v + br.x * u * v,
    y: tl.y * (1 - u) * (1 - v) + tr.y * u * (1 - v) + bl.y * (1 - u) * v + br.y * u * v
  };
}

function printPaperQuizPack(quiz) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Allow pop-ups for JCoins to open the printable paper quiz.");
    return;
  }
  printWindow.opener = null;
  const reusableRows = paperQuizRows(quiz, "A");
  const questionPages = paperQuizVariants.map((variant) => paperQuizVersionHtml(quiz, variant, { includeAnswerSheet: false, includeAnswerKey: false })).join("");
  const answerSheet = paperAnswerSheetHtml(quiz, "", reusableRows, {}, { reusable: true });
  const answerKeys = paperQuizVariants.map((variant) => paperAnswerKeyHtml(quiz, variant)).join("");
  const body = `${questionPages}${answerSheet}${answerKeys}`;
  printWindow.document.write(`<!doctype html>
    <html><head><meta charset="utf-8"><title>${escapeQuizHtml(quiz.title)} - Paper Types</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111; background: #fff; font-family: Arial, sans-serif; font-size: 10.5pt; line-height: 1.35; }
      section.page { min-height: 265mm; break-after: page; page-break-after: always; }
      header { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 9px; border-bottom: 2px solid #111; }
      h1, h2 { margin: 0; }
      h1 { font-size: 18pt; }
      h2 { font-size: 15pt; }
      .meta, .small { color: #333; font-size: 9pt; }
      .type-badge { border: 2px solid #111; padding: 8px 12px; font-size: 18pt; font-weight: 800; align-self: start; }
      .question { margin: 12px 0; break-inside: avoid; page-break-inside: avoid; }
      .prompt { white-space: pre-wrap; font-weight: 700; margin-bottom: 5px; }
      .option { margin: 3px 0 3px 18px; }
      .sheet-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 18px; margin-top: 12px; }
      .bubble-row { display: flex; align-items: center; gap: 7px; min-height: 22px; }
      .bubble { display: inline-flex; width: 18px; height: 18px; border: 1.6px solid #111; border-radius: 50%; align-items: center; justify-content: center; font-size: 8pt; line-height: 1; }
      .code-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
      .code-col { border: 1px solid #999; padding: 6px; }
      .code-col strong { display: block; margin-bottom: 5px; }
      .answer-key { columns: 4; column-gap: 20px; margin-top: 12px; font-size: 10pt; }
      .machine-data { margin-top: 8px; padding: 2px 0; border: 0; color: #555; font-size: 6pt; word-break: break-all; }
      .omr-page { position: relative; height: 265mm; overflow: hidden; }
      .omr-title { position: absolute; left: 9%; top: 4.5%; right: 24%; }
      .omr-type { position: absolute; right: 11%; top: 4.5%; border: 2px solid #111; padding: 6px 10px; font-weight: 800; font-size: 14pt; }
      .scan-marker { position: absolute; width: 9mm; height: 9mm; border: 4.5mm solid #111; background: #111; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .scan-marker.tl { left: 2.5%; top: 1.5%; }
      .scan-marker.tr { right: 2.5%; top: 1.5%; }
      .scan-marker.bl { left: 2.5%; bottom: 1.5%; }
      .scan-marker.br { right: 2.5%; bottom: 1.5%; }
      .zone-marker { position: absolute; width: 1.6mm; height: 1.6mm; margin: -0.8mm 0 0 -0.8mm; border: 0.8mm solid #111; background: #111; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .omr-label { position: absolute; font-weight: 700; }
      .omr-text { position: absolute; }
      .omr-bubble { position: absolute; width: 18px; height: 18px; margin: -9px 0 0 -9px; border: 1.7px solid #111; border-radius: 50%; background: #fff; }
      .omr-bubble-label { position: absolute; margin: -7px 0 0 12px; font-size: 8pt; font-weight: 700; }
      .omr-number { position: absolute; margin: -8px 0 0 -20px; font-size: 8pt; font-weight: 700; }
      .omr-bubble.filled { background: #111; }
      @media print { button { display: none; } }
    </style></head><body>${body}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 300);
}

function printBlankPaperSheet(quiz) {
  const rows = paperQuizRows(quiz, "A");
  if (!rows.length) {
    alert("This quiz has no paper-checkable questions yet. Use Multiple Choice, True/False, or Matching.");
    return;
  }
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Allow pop-ups for JCoins to open the answer sheet.");
    return;
  }
  printWindow.opener = null;
  const sheet = paperAnswerSheetHtml(quiz, "", rows, {}, { reusable: true });
  printWindow.document.write(`<!doctype html>
    <html><head><meta charset="utf-8"><title>${escapeQuizHtml(quiz.title)} - Answer Sheet</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111; background: #fff; font-family: Arial, sans-serif; font-size: 10.5pt; line-height: 1.35; }
      section.page { min-height: 265mm; break-after: page; page-break-after: always; }
      h2 { margin: 0; font-size: 15pt; }
      .meta { color: #333; font-size: 9pt; }
      .omr-page { position: relative; height: 265mm; overflow: hidden; }
      .omr-title { position: absolute; left: 9%; top: 4.5%; right: 24%; }
      .omr-type { position: absolute; right: 11%; top: 4.5%; border: 2px solid #111; padding: 6px 10px; font-weight: 800; font-size: 14pt; }
      .scan-marker { position: absolute; width: 9mm; height: 9mm; border: 4.5mm solid #111; background: #111; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .scan-marker.tl { left: 2.5%; top: 1.5%; }
      .scan-marker.tr { right: 2.5%; top: 1.5%; }
      .scan-marker.bl { left: 2.5%; bottom: 1.5%; }
      .scan-marker.br { right: 2.5%; bottom: 1.5%; }
      .zone-marker { position: absolute; width: 1.6mm; height: 1.6mm; margin: -0.8mm 0 0 -0.8mm; border: 0.8mm solid #111; background: #111; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .omr-label { position: absolute; font-weight: 700; }
      .omr-text { position: absolute; }
      .omr-bubble { position: absolute; width: 18px; height: 18px; margin: -9px 0 0 -9px; border: 1.7px solid #111; border-radius: 50%; background: #fff; }
      .omr-bubble-label { position: absolute; margin: -7px 0 0 12px; font-size: 8pt; font-weight: 700; }
      .omr-number { position: absolute; margin: -8px 0 0 -20px; font-size: 8pt; font-weight: 700; }
      .machine-data { margin-top: 8px; padding: 2px 0; border: 0; color: #555; font-size: 6pt; word-break: break-all; }
    </style></head><body>${sheet}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 300);
}

function printDemoPaperSheet(quiz) {
  const rows = paperQuizRows(quiz, "A");
  if (!rows.length) {
    alert("This quiz has no paper-checkable questions yet. Use Multiple Choice, True/False, or Matching.");
    return;
  }
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Allow pop-ups for JCoins to open the demo answer sheet.");
    return;
  }
  printWindow.opener = null;
  const studentCode = quiz.rows?.find((row) => row.studentCode)?.studentCode || "JCS1234";
  const answers = Object.fromEntries(rows.map((row) => [row.number, row.correctLetter || "A"]));
  const sheet = paperAnswerSheetHtml(quiz, "A", rows, { studentCode, variant: "A", answers });
  printWindow.document.write(`<!doctype html>
    <html><head><meta charset="utf-8"><title>${escapeQuizHtml(quiz.title)} - Demo Answer Sheet</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111; background: #fff; font-family: Arial, sans-serif; font-size: 10.5pt; line-height: 1.35; }
      section.page { min-height: 265mm; break-after: page; page-break-after: always; }
      h2 { margin: 0; font-size: 15pt; }
      .meta { color: #333; font-size: 9pt; }
      .omr-page { position: relative; height: 265mm; overflow: hidden; }
      .omr-title { position: absolute; left: 9%; top: 4.5%; right: 24%; }
      .omr-type { position: absolute; right: 11%; top: 4.5%; border: 2px solid #111; padding: 6px 10px; font-weight: 800; font-size: 14pt; }
      .scan-marker { position: absolute; width: 9mm; height: 9mm; border: 4.5mm solid #111; background: #111; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .scan-marker.tl { left: 2.5%; top: 1.5%; }
      .scan-marker.tr { right: 2.5%; top: 1.5%; }
      .scan-marker.bl { left: 2.5%; bottom: 1.5%; }
      .scan-marker.br { right: 2.5%; bottom: 1.5%; }
      .zone-marker { position: absolute; width: 1.6mm; height: 1.6mm; margin: -0.8mm 0 0 -0.8mm; border: 0.8mm solid #111; background: #111; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .omr-label { position: absolute; font-weight: 700; }
      .omr-text { position: absolute; }
      .omr-bubble { position: absolute; width: 18px; height: 18px; margin: -9px 0 0 -9px; border: 1.7px solid #111; border-radius: 50%; background: #fff; }
      .omr-bubble.filled { background: #111; }
      .omr-bubble-label { position: absolute; margin: -7px 0 0 12px; font-size: 8pt; font-weight: 700; }
      .omr-number { position: absolute; margin: -8px 0 0 -20px; font-size: 8pt; font-weight: 700; }
      .machine-data { margin-top: 8px; padding: 2px 0; border: 0; color: #555; font-size: 6pt; word-break: break-all; }
    </style></head><body>
      ${sheet}
    </body></html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 300);
}

function paperQuizVersionHtml(quiz, variant, options = {}) {
  const rows = paperQuizRows(quiz, variant);
  const includeAnswerSheet = options.includeAnswerSheet !== false;
  const includeAnswerKey = options.includeAnswerKey !== false;
  return `
    <section class="page">
      <header><div><h1>${escapeQuizHtml(quiz.title)}</h1><div class="meta">${escapeQuizHtml(quiz.subjectName)} | ${escapeQuizHtml(quiz.section)} | ${rows.length} paper items</div></div><div class="type-badge">TYPE ${variant}</div></header>
      <p class="small">Write your name on the answer sheet. Shade your 4 JCS digits, paper type, and one answer per item.</p>
      ${rows.map((row) => `<article class="question"><div class="prompt">${row.number}. ${escapeQuizHtml(row.prompt)}</div>${row.choices.map((choice, index) => `<div class="option">(${String.fromCharCode(65 + index)}) ${escapeQuizHtml(choice)}</div>`).join("")}</article>`).join("")}
    </section>
    ${includeAnswerSheet ? paperAnswerSheetHtml(quiz, variant, rows) : ""}
    ${includeAnswerKey ? paperAnswerKeyHtml(quiz, variant) : ""}`;
}

function paperAnswerKeyHtml(quiz, variant) {
  const rows = paperQuizRows(quiz, variant);
  const key = rows.map((row) => `<span>${row.number}-${row.correctLetter || "?"}</span>`).join(" ");
  return `<section class="page">
    <header><div><h2>Teacher Answer Key</h2><div class="meta">${escapeQuizHtml(quiz.title)} | Type ${variant}</div></div><div class="type-badge">KEY ${variant}</div></header>
    <div class="answer-key">${key}</div>
  </section>`;
}

function paperAnswerSheetHtml(quiz, variant, rows, filled = {}, options = {}) {
  const layout = paperSheetLayout(rows);
  const zones = paperScanZones();
  const codeDigits = String(filled.studentCode || "").replace(/\D/g, "").slice(-4);
  const answerMap = filled.answers || {};
  const typeLabel = options.reusable ? "SHADE TYPE" : variant ? `TYPE ${variant}` : "SHADE TYPE";
  const bubbles = [
    ...layout.code.flatMap((column, columnIndex) => column.map((bubble) => `${omrBubbleHtml({ ...bubble, filled: codeDigits[columnIndex] === bubble.value })}${bubble.value === 0 ? `<span class="omr-number" style="${omrStyle({ x: bubble.x, y: bubble.y - 26 })}">D${columnIndex + 1}</span>` : ""}`)),
    ...layout.type.map((bubble) => omrBubbleHtml({ ...bubble, filled: String(filled.variant || "") === bubble.value })),
    ...layout.answers.flatMap((row) => [
      `<span class="omr-number" style="${omrStyle({ x: row.labelX, y: row.y })}">${row.number}.</span>`,
      ...row.choices.map((bubble) => omrBubbleHtml({ ...bubble, filled: answerMap[row.number] === bubble.value }))
    ])
  ].join("");
  return `<section class="page omr-page">
    <span class="scan-marker tl"></span><span class="scan-marker tr"></span><span class="scan-marker bl"></span><span class="scan-marker br"></span>
    ${paperZoneMarkersHtml(zones)}
    <div class="omr-title"><h2>Answer Sheet</h2><div class="meta">${escapeQuizHtml(quiz.title)} | ${escapeQuizHtml(quiz.subjectName)} | ${escapeQuizHtml(quiz.section)}</div></div>
    <div class="omr-type">${typeLabel}</div>
    <div class="omr-text" style="left:8%;top:12%;">Name: ________________________________ Section: __________________ Date: __________ Score: ________</div>
    <div class="omr-label" style="left:8%;top:16.5%;">Student Code: JCS____</div>
    <div class="omr-label" style="left:8%;top:40%;">Paper Type</div>
    <div class="omr-label" style="left:8%;top:45.5%;">Answers</div>
    ${bubbles}
    <div class="machine-data" style="position:absolute;left:6%;right:6%;bottom:3%;">JCOINS-PAPER quiz=${escapeQuizHtml(quiz.id)} type=${variant}</div>
  </section>`;
}

function paperZoneMarkersHtml(zones) {
  return Object.values(zones).flatMap((zone) => ["tl", "tr", "bl", "br"].map((corner) => (
    `<span class="zone-marker" style="${omrStyle(zone[corner])}"></span>`
  ))).join("");
}

function omrStyle(point) {
  return `left:${(point.x / 10).toFixed(3)}%;top:${(point.y / 14.14).toFixed(3)}%;`;
}

function omrBubbleHtml(point) {
  return `<span class="omr-bubble${point.filled ? " filled" : ""}" style="${omrStyle(point)}"></span><span class="omr-bubble-label" style="${omrStyle({ x: point.x, y: point.y })}">${point.value}</span>`;
}

function printQuizPaper(quiz) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Allow pop-ups for JCoins to open the printable quiz.");
    return;
  }
  printWindow.opener = null;
  const questions = (quiz.questions || []).map((question, index) => printableQuestion(question, index)).join("");
  printWindow.document.write(`<!doctype html>
    <html><head><meta charset="utf-8"><title>${escapeQuizHtml(quiz.title)} - Paper Quiz</title>
    <style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111; background: #fff; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.45; }
      header { padding-bottom: 12px; border-bottom: 2px solid #111; }
      h1 { margin: 0 0 5px; font-size: 20pt; }
      .meta { margin: 0; color: #333; }
      .student-fields { display: grid; grid-template-columns: 1fr 150px; gap: 20px; margin: 20px 0 14px; }
      .field { min-height: 28px; border-bottom: 1px solid #111; }
      .instructions { margin: 0 0 18px; padding: 9px 11px; border: 1px solid #999; }
      .question { margin: 0 0 18px; break-inside: avoid; page-break-inside: avoid; }
      .prompt { margin-bottom: 8px; font-weight: 700; white-space: pre-wrap; }
      .option { margin: 5px 0 5px 22px; }
      .answer-line { height: 26px; margin: 5px 0 0 22px; border-bottom: 1px solid #777; }
      .work-line { height: 24px; border-bottom: 1px solid #aaa; }
      .matching { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-left: 22px; }
      .matching p { margin: 5px 0; }
      footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #999; text-align: center; font-size: 9pt; color: #555; }
      @media print { .no-print { display: none; } }
    </style></head><body>
      <header><h1>${escapeQuizHtml(quiz.title)}</h1><p class="meta">${escapeQuizHtml(quiz.subjectName)} · ${escapeQuizHtml(quiz.section)} · ${escapeQuizHtml(quiz.difficulty)} · ${quiz.questions?.length || 0} items</p></header>
      <div class="student-fields"><div class="field">Name:</div><div class="field">Score:</div><div class="field">Section:</div><div class="field">Date:</div></div>
      <p class="instructions"><strong>Instructions:</strong> Read each question carefully. Write or mark your answer clearly.</p>
      <main>${questions}</main>
      <footer>JCoins Arena · ${escapeQuizHtml(quiz.title)}</footer>
    </body></html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 300);
}

function printQuizAnswerKey(quiz) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Allow pop-ups for JCoins to open the printable answer key.");
    return;
  }
  printWindow.opener = null;
  const answers = (quiz.questions || []).map((question, index) => printableAnswerKeyQuestion(question, index)).join("");
  printWindow.document.write(`<!doctype html>
    <html><head><meta charset="utf-8"><title>${escapeQuizHtml(quiz.title)} - Answer Key</title>
    <style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111; background: #fff; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.45; }
      header { padding-bottom: 12px; border-bottom: 2px solid #111; }
      h1 { margin: 0 0 5px; font-size: 20pt; }
      .meta { margin: 0; color: #333; }
      .instructions { margin: 18px 0; padding: 9px 11px; border: 1px solid #999; }
      .question { margin: 0 0 15px; break-inside: avoid; page-break-inside: avoid; }
      .prompt { margin-bottom: 7px; font-weight: 700; white-space: pre-wrap; }
      .answer { margin-left: 22px; padding: 7px 9px; border-left: 3px solid #111; background: #f1f1f1; font-weight: 700; white-space: pre-wrap; }
      footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #999; text-align: center; font-size: 9pt; color: #555; }
    </style></head><body>
      <header><h1>${escapeQuizHtml(quiz.title)} - Answer Key</h1><p class="meta">${escapeQuizHtml(quiz.subjectName)} | ${escapeQuizHtml(quiz.section)} | ${escapeQuizHtml(quiz.difficulty)} | ${quiz.questions?.length || 0} items</p></header>
      <p class="instructions"><strong>Correction key:</strong> Use this teacher copy to check the printed quiz.</p>
      <main>${answers}</main>
      <footer>JCoins Arena | ${escapeQuizHtml(quiz.title)} | Answer Key</footer>
    </body></html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 300);
}

function printableAnswerKeyQuestion(question, index) {
  const prompt = `<div class="prompt">${index + 1}. ${escapeQuizHtml(question.prompt)}</div>`;
  let answer = "";
  if (["multiple_choice", "true_false"].includes(question.type)) {
    const optionIndex = (question.options || []).indexOf(question.answer);
    answer = `${optionIndex >= 0 ? `${String.fromCharCode(65 + optionIndex)}. ` : ""}${question.answer ?? ""}`;
  } else if (question.type === "multiple_select") {
    const correctAnswers = question.answers || (Array.isArray(question.answer) ? question.answer : [question.answer]);
    answer = correctAnswers.map((value) => {
      const optionIndex = (question.options || []).indexOf(value);
      return `${optionIndex >= 0 ? `${String.fromCharCode(65 + optionIndex)}. ` : ""}${value ?? ""}`;
    }).join("; ");
  } else if (question.type === "fill_blank") {
    answer = (question.acceptedAnswers || [question.answer]).join(" / ");
  } else if (question.type === "matching") {
    const pairs = question.matchingPairs || [];
    const choices = rotatePrintableChoices(pairs.map((pair) => pair.right));
    answer = pairs.map((pair, pairIndex) => {
      const choiceIndex = choices.indexOf(pair.right);
      return `${pairIndex + 1}-${choiceIndex >= 0 ? String.fromCharCode(65 + choiceIndex) : "?"} (${pair.left} - ${pair.right})`;
    }).join("\n");
  } else {
    const tolerance = Number(question.tolerance || 0);
    answer = `${question.answer ?? ""}${tolerance > 0 ? ` (accepted tolerance: +/- ${tolerance})` : ""}`;
  }
  return `<section class="question">${prompt}<div class="answer">${escapeQuizHtml(answer)}</div></section>`;
}

function printableQuestion(question, index) {
  const prompt = `<div class="prompt">${index + 1}. ${escapeQuizHtml(question.prompt)}</div>`;
  if (["multiple_choice", "true_false"].includes(question.type)) {
    return `<section class="question">${prompt}${(question.options || []).map((option, optionIndex) => `<div class="option">○ ${String.fromCharCode(65 + optionIndex)}. ${escapeQuizHtml(option)}</div>`).join("")}</section>`;
  }
  if (question.type === "multiple_select") {
    return `<section class="question">${prompt}${(question.options || []).map((option, optionIndex) => `<div class="option">□ ${String.fromCharCode(65 + optionIndex)}. ${escapeQuizHtml(option)}</div>`).join("")}</section>`;
  }
  if (question.type === "matching") {
    const pairs = question.matchingPairs || [];
    const choices = rotatePrintableChoices(pairs.map((pair) => pair.right));
    return `<section class="question">${prompt}<div class="matching"><div>${pairs.map((pair, pairIndex) => `<p>_____ ${pairIndex + 1}. ${escapeQuizHtml(pair.left)}</p>`).join("")}</div><div>${choices.map((choice, choiceIndex) => `<p>${String.fromCharCode(65 + choiceIndex)}. ${escapeQuizHtml(choice)}</p>`).join("")}</div></div></section>`;
  }
  if (question.type === "computation") {
    return `<section class="question">${prompt}${Array.from({ length: 5 }, () => '<div class="work-line"></div>').join("")}<div class="answer-line">Final answer:</div></section>`;
  }
  const lineCount = question.type === "fill_blank" ? 1 : 2;
  return `<section class="question">${prompt}${Array.from({ length: lineCount }, () => '<div class="answer-line"></div>').join("")}</section>`;
}

function rotatePrintableChoices(choices) {
  if (choices.length < 2) return choices;
  const offset = Math.ceil(choices.length / 2);
  return [...choices.slice(offset), ...choices.slice(0, offset)];
}

function escapeQuizHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function revealLabel(quiz) {
  if (quiz.answerVisibility === "immediate") return "immediate";
  if (quiz.answerVisibility === "scheduled") return quiz.answerRevealAt ? new Date(quiz.answerRevealAt).toLocaleString() : "scheduled";
  if (quiz.answerVisibility === "never") return "never";
  return "after deadline";
}
