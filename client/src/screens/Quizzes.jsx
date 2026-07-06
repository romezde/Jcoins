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
    <button type="button" className="soft" onClick={() => printQuizAnswerKey(quiz)}><FileCheck2 size={16} />Answer Key PDF</button>
    {quiz.status === "draft" && <button type="button" className="soft" onClick={() => run(() => post(`/admin/quizzes/${quiz.id}/publish`, {}), "Quiz published")}>Publish</button>}
    {quiz.status === "published" && <button type="button" className="soft" onClick={() => run(() => post(`/admin/quizzes/${quiz.id}/close`, {}), "Quiz closed")}>Close</button>}
    {quiz.status === "closed" && <button type="button" className="soft" onClick={() => run(() => post(`/admin/quizzes/${quiz.id}/publish`, {}), "Quiz reopened")}>Reopen</button>}
    <button type="button" className="danger" onClick={() => deleteQuiz(quiz, run)}>Delete</button>
  </div>;
}

function QuizCard({ quiz, data, run }) {
  return <Panel title={`${quiz.title} Results`} wide defaultOpen={false} actions={<div className="inline"><QuizFormModal data={data} run={run} quiz={quiz} /><button type="button" className="soft" onClick={() => printQuizPaper(quiz)}><Printer size={16} />Print / Save PDF</button><button type="button" className="soft" onClick={() => printQuizAnswerKey(quiz)}><FileCheck2 size={16} />Answer Key PDF</button><button type="button" className="danger" onClick={() => deleteQuiz(quiz, run)}>Delete Quiz</button></div>}>
    <p className="muted-line">{quiz.subjectName} | {quiz.section} | {quizTypesLabel(quiz)} | {quiz.timeLimitMinutes} minutes | passing {quiz.passingScore}/{quiz.questions.length} | reward {quiz.rewardValue} JC | reveal {revealLabel(quiz)}</p>
    <Table columns={["Student", "Attempts", "Latest", "Best Correct", "Best JCoins", "Submitted"]} rows={(quiz.rows || []).map((row) => [row.studentName, row.attempts, row.latestScore || "-", row.bestScore || "-", row.bestAwarded, row.submittedAt ? new Date(row.submittedAt).toLocaleString() : "-"])} />
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
