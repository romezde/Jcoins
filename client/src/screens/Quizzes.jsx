import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { del, post, postForm, put, today } from "../api.js";
import { ActionModal, DropdownChecklist, Field, Panel, Select, Table } from "../components/ui.jsx";

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

export default function Quizzes({ data, run, role }) {
  const [filter, setFilter] = useState({ subjectId: "all", section: "all", status: "all", search: "" });
  const quizzes = (data.quizzes || []).filter((quiz) => {
    const q = filter.search.trim().toLowerCase();
    return (filter.subjectId === "all" || quiz.subjectId === filter.subjectId)
      && (filter.section === "all" || quiz.section === filter.section)
      && (filter.status === "all" || quiz.status === filter.status)
      && (!q || [quiz.title, quiz.subjectName, quiz.section, quiz.difficulty, quiz.status].some((value) => String(value || "").toLowerCase().includes(q)));
  });
  if (role === "student") return <StudentQuizzes data={data} run={run} />;
  return <div className="dashboard-grid">
    <QuizFormModal data={data} run={run} />
    <Panel title="Quiz List" wide defaultOpen>
      <div className="filter-bar">
        <Select label="Subject" value={filter.subjectId} onChange={(subjectId) => setFilter({ ...filter, subjectId })} options={[{ value: "all", label: "All subjects" }, ...data.subjects.map((subject) => ({ value: subject.id, label: subject.name }))]} />
        <Select label="Section" value={filter.section} onChange={(section) => setFilter({ ...filter, section })} options={[{ value: "all", label: "All sections" }, ...(data.sections || []).map((section) => ({ value: section, label: section }))]} />
        <Select label="Status" value={filter.status} onChange={(status) => setFilter({ ...filter, status })} options={[{ value: "all", label: "All" }, { value: "draft", label: "Draft" }, { value: "published", label: "Published" }, { value: "closed", label: "Closed" }]} />
        <Field label="Search" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
      </div>
      <Table columns={["Quiz", "Subject", "Section", "Status", "Difficulty", "Time", "Deadline", "Tracker", "Actions"]} rows={quizzes.map((quiz) => [
        quiz.title,
        quiz.subjectName,
        quiz.section,
        statusLabel(quiz.status),
        `${quiz.difficulty} (${quiz.rewardValue} JC) | ${quizTypeLabel(quiz.quizType)}`,
        `${quiz.timeLimitMinutes} min`,
        quiz.deadline,
        quiz.tracker,
        <QuizActions quiz={quiz} data={data} run={run} />
      ])} />
    </Panel>
    {quizzes.map((quiz) => <QuizCard key={quiz.id} quiz={quiz} run={run} />)}
  </div>;
}

function QuizFormModal({ data, run, quiz = null }) {
  const firstSubject = data.subjects[0]?.id || "";
  const firstSection = data.sections[0] || "";
  const [form, setForm] = useState(() => quiz ? {
    ...quiz,
    questions: quiz.questions.map(cloneQuestion),
    retakeStudentIds: [...(quiz.retakeStudentIds || [])]
  } : ({
    title: "New Quiz",
    subjectId: firstSubject,
    section: firstSection,
    difficulty: "Easy",
    quizType: "mixed",
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
  const [aiFile, setAiFile] = useState(null);
  const [aiMessage, setAiMessage] = useState("");
  const groupStudents = studentsForQuiz(data, form);

  async function generateDraft() {
    setAiMessage("Generating quiz draft...");
    const payload = new FormData();
    payload.append("message", aiPrompt || `Create an auto-gradable ${form.difficulty} quiz.`);
    if (aiFile) payload.append("file", aiFile);
    try {
      const result = await postForm("/assistant/chat", payload);
      if (result.quizDraft?.questions?.length) {
        const questions = result.quizDraft.questions.map((question) => cloneQuestion({ ...blankQuestion(question.type), ...question, id: crypto.randomUUID() }));
        setForm({
          ...form,
          title: result.quizDraft.title || form.title,
          difficulty: result.quizDraft.difficulty || form.difficulty,
          quizType: result.quizDraft.quizType || (new Set(questions.map((question) => question.type)).size === 1 ? questions[0].type : "mixed"),
          questions,
          passingScore: Math.min(Number(result.quizDraft.passingScore || questions.length), questions.length)
        });
      }
      setAiMessage(result.reply || "Draft ready.");
    } catch (err) {
      setAiMessage(err.message);
    }
  }

  function submit(e) {
    e.preventDefault();
    run(() => quiz
      ? put(`/admin/quizzes/${quiz.id}`, cleanQuizForm(form))
      : post("/admin/quizzes", cleanQuizForm(form)), quiz ? "Quiz updated" : "Quiz draft created");
  }

  return <ActionModal title={quiz ? `Edit ${quiz.title}` : "Create Quiz"} buttonLabel={quiz ? "Edit" : "Create Quiz"} icon={quiz ? Pencil : undefined}>
    <form onSubmit={submit}>
      <div className="form-grid two">
        <Field label="Quiz Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
        <Select label="Subject" value={form.subjectId} onChange={(subjectId) => setForm({ ...form, subjectId, retakeStudentIds: [] })} options={data.subjects} />
        <Select label="Section" value={form.section} onChange={(section) => setForm({ ...form, section, retakeStudentIds: [] })} options={(data.sections || []).map((section) => ({ value: section, label: section }))} />
        <Select label="Difficulty" value={form.difficulty} onChange={(difficulty) => setForm({ ...form, difficulty })} options={(data.settings.quizzes?.difficulties || []).map((item) => ({ value: item.name, label: `${item.name} (${item.points} JC)` }))} />
        <Select label="Quiz Type" value={form.quizType || "mixed"} onChange={(quizType) => setForm({ ...form, quizType, questions: quizType === "mixed" ? form.questions : form.questions.map((question) => convertQuestionType(question, quizType)) })} options={quizTypeOptions} />
        <Field label="Deadline" type="date" value={form.deadline} onChange={(deadline) => setForm({ ...form, deadline })} />
        <Field label="Time Limit (minutes)" type="number" min="1" max="240" step="1" required value={form.timeLimitMinutes} onChange={(timeLimitMinutes) => setForm({ ...form, timeLimitMinutes })} />
        <Field label="Passing Score" type="number" value={form.passingScore} onChange={(passingScore) => setForm({ ...form, passingScore })} />
        <Select label="Answer Reveal" value={form.answerVisibility} onChange={(answerVisibility) => setForm({ ...form, answerVisibility })} options={answerVisibility} />
        {form.answerVisibility === "scheduled" && <Field label="Reveal Date/Time" type="datetime-local" value={form.answerRevealAt} onChange={(answerRevealAt) => setForm({ ...form, answerRevealAt })} />}
      </div>
      <div className="checklist compact-checks">
        <label className="check"><input type="checkbox" checked={form.shuffleQuestions} onChange={(e) => setForm({ ...form, shuffleQuestions: e.target.checked })} />Shuffle questions</label>
        <label className="check"><input type="checkbox" checked={form.shuffleOptions} onChange={(e) => setForm({ ...form, shuffleOptions: e.target.checked })} />Shuffle options</label>
      </div>
      <Panel title="AI Draft Helper" defaultOpen={false}>
        <Field label="Ask AI" value={aiPrompt} onChange={setAiPrompt} />
        <label>Reference File<input type="file" accept=".pptx,.docx,.pdf,.xlsx,.csv,.txt" onChange={(e) => setAiFile(e.target.files?.[0] || null)} /></label>
        <button type="button" className="soft" onClick={generateDraft}>Generate Editable Draft</button>
        {aiMessage && <p className="muted-line">{aiMessage}</p>}
      </Panel>
      <QuestionEditor quizType={form.quizType || "mixed"} questions={form.questions} setQuestions={(questions) => setForm({ ...form, questions, passingScore: Math.min(Number(form.passingScore || questions.length), Math.max(1, questions.length)) })} />
      <Select label="Retakes" value={form.retakeMode} onChange={(retakeMode) => setForm({ ...form, retakeMode })} options={[{ value: "none", label: "No retakes" }, { value: "all", label: "Retakes for everyone" }, { value: "selected", label: "Retakes for selected students" }]} />
      {form.retakeMode === "selected" && <DropdownChecklist label="Students allowed to retake" items={groupStudents.map((student) => ({ id: student.id, name: student.name }))} selected={form.retakeStudentIds} onChange={(retakeStudentIds) => setForm({ ...form, retakeStudentIds })} />}
      <button>Create Draft</button>
    </form>
  </ActionModal>;
}

function QuestionEditor({ quizType, questions, setQuestions }) {
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
      <Select label="Question Type" value={question.type} onChange={(type) => update(index, convertQuestionType(question, type))} options={quizType === "mixed" ? questionTypeOptions : questionTypeOptions.filter((option) => option.value === quizType)} />
      <Field label="Prompt" value={question.prompt} onChange={(prompt) => update(index, { ...question, prompt })} />
      <QuestionAnswerEditor question={question} onChange={(next) => update(index, next)} />
    </section>)}
    <button type="button" className="soft" onClick={() => setQuestions([...questions, blankQuestion(quizType === "mixed" ? "multiple_choice" : quizType)])}>Add Question</button>
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
    {quiz.status === "draft" && <QuizFormModal data={data} run={run} quiz={quiz} />}
    {quiz.status === "draft" && <button type="button" className="soft" onClick={() => run(() => post(`/admin/quizzes/${quiz.id}/publish`, {}), "Quiz published")}>Publish</button>}
    {quiz.status === "published" && <button type="button" className="soft" onClick={() => run(() => post(`/admin/quizzes/${quiz.id}/close`, {}), "Quiz closed")}>Close</button>}
    <button type="button" className="danger" onClick={() => deleteQuiz(quiz, run)}>Delete</button>
  </div>;
}

function QuizCard({ quiz, run }) {
  return <Panel title={`${quiz.title} Results`} wide defaultOpen={false} actions={<button type="button" className="danger" onClick={() => deleteQuiz(quiz, run)}>Delete Quiz</button>}>
    <p className="muted-line">{quiz.subjectName} | {quiz.section} | {quizTypeLabel(quiz.quizType)} | {quiz.timeLimitMinutes} minutes | passing {quiz.passingScore}/{quiz.questions.length} | reward {quiz.rewardValue} JC | reveal {revealLabel(quiz)}</p>
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
    {activeQuiz && <StudentQuizPanel quiz={activeQuiz} attempt={activeAttempt || activeQuiz.submission?.activeAttempt} run={run} onFinished={() => setActiveAttempt(null)} />}
  </div>;
}

function StudentQuizPanel({ quiz, attempt, run, onFinished }) {
  const [answers, setAnswers] = useState({});
  const [remaining, setRemaining] = useState(() => secondsRemaining(attempt));
  const submittedRef = useRef(false);
  const showAnswers = quiz.submission?.showAnswers;
  async function submitQuiz() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const result = await run(() => post(`/student/quizzes/${quiz.id}/submit`, { answers }), remaining <= 0 ? "Time ended; quiz submitted" : "Quiz submitted");
    if (!result) submittedRef.current = false;
    else onFinished();
  }
  useEffect(() => {
    submittedRef.current = false;
    setRemaining(secondsRemaining(attempt));
    if (!attempt?.dueAt) return undefined;
    const timer = window.setInterval(() => setRemaining(secondsRemaining(attempt)), 1000);
    return () => window.clearInterval(timer);
  }, [attempt?.id, attempt?.dueAt]);
  useEffect(() => {
    if (attempt?.dueAt && remaining <= 0 && quiz.canSubmit) submitQuiz();
  }, [remaining, attempt?.dueAt, quiz.canSubmit]);
  return <Panel title={quiz.title} wide defaultOpen>
    <div className="quiz-session-head">
      <p className="muted-line">{quiz.subjectName} | {quiz.difficulty} | {quizTypeLabel(quiz.quizType)} | reward up to {quiz.rewardValue} JC | passing {quiz.passingScore}/{quiz.questions.length}</p>
      {attempt?.dueAt && <strong className={remaining <= 60 ? "quiz-timer warning" : "quiz-timer"}>{formatTimer(remaining)}</strong>}
    </div>
    {quiz.submission?.latest && <div className="notice">Latest score: {quiz.submission.latest.correct}/{quiz.submission.latest.total}. Best reward: {quiz.submission.bestAwarded} JCoins.</div>}
    <form className="quiz-answer-form" onSubmit={(event) => { event.preventDefault(); submitQuiz(); }}>
      {quiz.questions.map((question, index) => <section key={question.id} className="quiz-question-card">
        <strong>{index + 1}. {question.prompt}</strong>
        <StudentQuestionInput question={question} value={answers[question.id]} disabled={!quiz.canSubmit} showAnswers={showAnswers} onChange={(value) => setAnswers({ ...answers, [question.id]: value })} />
      </section>)}
      {quiz.canSubmit ? <button>Submit Quiz</button> : <p className="muted-line">This quiz is not open for a new submission.</p>}
    </form>
  </Panel>;
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
  return {
    ...form,
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

function statusLabel(status) {
  return { draft: "Draft", published: "Published", closed: "Closed" }[status] || status;
}

function quizTypeLabel(type) {
  return quizTypeOptions.find((option) => option.value === type)?.label || "Mixed Question Types";
}

function revealLabel(quiz) {
  if (quiz.answerVisibility === "immediate") return "immediate";
  if (quiz.answerVisibility === "scheduled") return quiz.answerRevealAt ? new Date(quiz.answerRevealAt).toLocaleString() : "scheduled";
  if (quiz.answerVisibility === "never") return "never";
  return "after deadline";
}
