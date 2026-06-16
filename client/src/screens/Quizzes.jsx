import React, { useMemo, useState } from "react";
import { del, post, postForm, put, today } from "../api.js";
import { ActionModal, DropdownChecklist, Field, Panel, Select, Table } from "../components/ui.jsx";

const blankQuestion = () => ({ id: crypto.randomUUID(), type: "multiple_choice", prompt: "", options: ["", "", "", ""], answer: "" });
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
    <QuizCreateModal data={data} run={run} />
    <Panel title="Quiz List" wide defaultOpen>
      <div className="filter-bar">
        <Select label="Subject" value={filter.subjectId} onChange={(subjectId) => setFilter({ ...filter, subjectId })} options={[{ value: "all", label: "All subjects" }, ...data.subjects.map((subject) => ({ value: subject.id, label: subject.name }))]} />
        <Select label="Section" value={filter.section} onChange={(section) => setFilter({ ...filter, section })} options={[{ value: "all", label: "All sections" }, ...(data.sections || []).map((section) => ({ value: section, label: section }))]} />
        <Select label="Status" value={filter.status} onChange={(status) => setFilter({ ...filter, status })} options={[{ value: "all", label: "All" }, { value: "draft", label: "Draft" }, { value: "published", label: "Published" }, { value: "closed", label: "Closed" }]} />
        <Field label="Search" value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
      </div>
      <Table columns={["Quiz", "Subject", "Section", "Status", "Difficulty", "Deadline", "Tracker", "Actions"]} rows={quizzes.map((quiz) => [
        quiz.title,
        quiz.subjectName,
        quiz.section,
        statusLabel(quiz.status),
        `${quiz.difficulty} (${quiz.rewardValue} JC)`,
        quiz.deadline,
        quiz.tracker,
        <QuizActions quiz={quiz} run={run} />
      ])} />
    </Panel>
    {quizzes.map((quiz) => <QuizCard key={quiz.id} quiz={quiz} run={run} />)}
  </div>;
}

function QuizCreateModal({ data, run }) {
  const firstSubject = data.subjects[0]?.id || "";
  const firstSection = data.sections[0] || "";
  const [form, setForm] = useState(() => ({
    title: "New Quiz",
    subjectId: firstSubject,
    section: firstSection,
    difficulty: "Easy",
    deadline: today(),
    passingScore: 1,
    questions: [blankQuestion()],
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
        const questions = result.quizDraft.questions.map((question) => ({ ...blankQuestion(), ...question, id: crypto.randomUUID() }));
        setForm({
          ...form,
          title: result.quizDraft.title || form.title,
          difficulty: result.quizDraft.difficulty || form.difficulty,
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
    run(() => post("/admin/quizzes", cleanQuizForm(form)), "Quiz draft created");
  }

  return <ActionModal title="Create Quiz">
    <form onSubmit={submit}>
      <div className="form-grid two">
        <Field label="Quiz Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
        <Select label="Subject" value={form.subjectId} onChange={(subjectId) => setForm({ ...form, subjectId, retakeStudentIds: [] })} options={data.subjects} />
        <Select label="Section" value={form.section} onChange={(section) => setForm({ ...form, section, retakeStudentIds: [] })} options={(data.sections || []).map((section) => ({ value: section, label: section }))} />
        <Select label="Difficulty" value={form.difficulty} onChange={(difficulty) => setForm({ ...form, difficulty })} options={(data.settings.quizzes?.difficulties || []).map((item) => ({ value: item.name, label: `${item.name} (${item.points} JC)` }))} />
        <Field label="Deadline" type="date" value={form.deadline} onChange={(deadline) => setForm({ ...form, deadline })} />
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
      <QuestionEditor questions={form.questions} setQuestions={(questions) => setForm({ ...form, questions, passingScore: Math.min(Number(form.passingScore || questions.length), Math.max(1, questions.length)) })} />
      <Select label="Retakes" value={form.retakeMode} onChange={(retakeMode) => setForm({ ...form, retakeMode })} options={[{ value: "none", label: "No retakes" }, { value: "all", label: "Retakes for everyone" }, { value: "selected", label: "Retakes for selected students" }]} />
      {form.retakeMode === "selected" && <DropdownChecklist label="Students allowed to retake" items={groupStudents.map((student) => ({ id: student.id, name: student.name }))} selected={form.retakeStudentIds} onChange={(retakeStudentIds) => setForm({ ...form, retakeStudentIds })} />}
      <button>Create Draft</button>
    </form>
  </ActionModal>;
}

function QuestionEditor({ questions, setQuestions }) {
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
      <Select label="Type" value={question.type} onChange={(type) => update(index, type === "true_false" ? { ...question, type, options: ["True", "False"], answer: "True" } : { ...question, type })} options={[{ value: "multiple_choice", label: "Multiple choice" }, { value: "true_false", label: "True / False" }]} />
      <Field label="Prompt" value={question.prompt} onChange={(prompt) => update(index, { ...question, prompt })} />
      {question.type === "multiple_choice" && question.options.map((option, optionIndex) => <Field key={optionIndex} label={`Option ${optionIndex + 1}`} value={option} onChange={(value) => update(index, { ...question, options: question.options.map((item, itemIndex) => itemIndex === optionIndex ? value : item), answer: question.answer === option ? value : question.answer })} />)}
      <Select label="Correct Answer" value={question.answer} onChange={(answer) => update(index, { ...question, answer })} options={(question.type === "true_false" ? ["True", "False"] : question.options.filter(Boolean)).map((option) => ({ value: option, label: option || "Option" }))} />
    </section>)}
    <button type="button" className="soft" onClick={() => setQuestions([...questions, blankQuestion()])}>Add Question</button>
  </div>;
}

function deleteQuiz(quiz, run) {
  return confirm(`Delete ${quiz.title}? This removes quiz submissions and quiz JCoin transactions.`)
    && run(() => del(`/admin/quizzes/${quiz.id}`), "Quiz deleted");
}

function QuizActions({ quiz, run }) {
  return <div className="inline">
    {quiz.status === "draft" && <button type="button" className="soft" onClick={() => run(() => post(`/admin/quizzes/${quiz.id}/publish`, {}), "Quiz published")}>Publish</button>}
    {quiz.status === "published" && <button type="button" className="soft" onClick={() => run(() => post(`/admin/quizzes/${quiz.id}/close`, {}), "Quiz closed")}>Close</button>}
    <button type="button" className="danger" onClick={() => deleteQuiz(quiz, run)}>Delete</button>
  </div>;
}

function QuizCard({ quiz, run }) {
  return <Panel title={`${quiz.title} Results`} wide defaultOpen={false} actions={<button type="button" className="danger" onClick={() => deleteQuiz(quiz, run)}>Delete Quiz</button>}>
    <p className="muted-line">{quiz.subjectName} | {quiz.section} | passing {quiz.passingScore}/{quiz.questions.length} | reward {quiz.rewardValue} JC | reveal {revealLabel(quiz)}</p>
    <Table columns={["Student", "Attempts", "Latest", "Best Correct", "Best JCoins", "Submitted"]} rows={(quiz.rows || []).map((row) => [row.studentName, row.attempts, row.latestScore || "-", row.bestScore || "-", row.bestAwarded, row.submittedAt ? new Date(row.submittedAt).toLocaleString() : "-"])} />
  </Panel>;
}

function StudentQuizzes({ data, run }) {
  const [activeQuizId, setActiveQuizId] = useState("");
  const activeQuiz = useMemo(() => (data.quizzes || []).find((quiz) => quiz.id === activeQuizId), [data.quizzes, activeQuizId]);
  return <div className="dashboard-grid">
    <Panel title="My Quizzes" wide defaultOpen>
      <Table columns={["Quiz", "Subject", "Status", "Deadline", "Score", "JCoins", "Action"]} rows={(data.quizzes || []).map((quiz) => [
        quiz.title,
        quiz.subjectName,
        statusLabel(quiz.status),
        quiz.deadline,
        quiz.submission?.latest ? `${quiz.submission.latest.correct}/${quiz.submission.latest.total}` : "Not taken",
        quiz.submission?.bestAwarded ?? 0,
        <button type="button" className="soft" onClick={() => setActiveQuizId(quiz.id)}>{quiz.canSubmit ? "Answer" : "View"}</button>
      ])} />
    </Panel>
    {activeQuiz && <StudentQuizPanel quiz={activeQuiz} run={run} />}
  </div>;
}

function StudentQuizPanel({ quiz, run }) {
  const [answers, setAnswers] = useState({});
  const showAnswers = quiz.submission?.showAnswers;
  function submit(e) {
    e.preventDefault();
    run(() => post(`/student/quizzes/${quiz.id}/submit`, { answers }), "Quiz submitted");
  }
  return <Panel title={quiz.title} wide defaultOpen>
    <p className="muted-line">{quiz.subjectName} | {quiz.difficulty} | reward up to {quiz.rewardValue} JC | passing {quiz.passingScore}/{quiz.questions.length}</p>
    {quiz.submission?.latest && <div className="notice">Latest score: {quiz.submission.latest.correct}/{quiz.submission.latest.total}. Best reward: {quiz.submission.bestAwarded} JCoins.</div>}
    <form className="quiz-answer-form" onSubmit={submit}>
      {quiz.questions.map((question, index) => <section key={question.id} className="quiz-question-card">
        <strong>{index + 1}. {question.prompt}</strong>
        <div className="quiz-options">
          {question.options.map((option) => <label key={option} className={`check ${showAnswers && option === question.answer ? "correct-answer" : ""}`}>
            <input type="radio" name={question.id} value={option} checked={answers[question.id] === option} disabled={!quiz.canSubmit} onChange={() => setAnswers({ ...answers, [question.id]: option })} />
            {option}
          </label>)}
        </div>
      </section>)}
      {quiz.canSubmit ? <button>Submit Quiz</button> : <p className="muted-line">This quiz is not open for a new submission.</p>}
    </form>
  </Panel>;
}

function cleanQuizForm(form) {
  return {
    ...form,
    passingScore: Number(form.passingScore || 1),
    questions: form.questions.map((question) => ({
      ...question,
      prompt: String(question.prompt || "").trim(),
      options: question.type === "true_false" ? ["True", "False"] : question.options.map((option) => String(option || "").trim()).filter(Boolean),
      answer: String(question.answer || "").trim()
    }))
  };
}

function studentsForQuiz(data, form) {
  return (data.students || []).filter((student) => student.section === form.section && (student.subjectIds || []).includes(form.subjectId));
}

function statusLabel(status) {
  return { draft: "Draft", published: "Published", closed: "Closed" }[status] || status;
}

function revealLabel(quiz) {
  if (quiz.answerVisibility === "immediate") return "immediate";
  if (quiz.answerVisibility === "scheduled") return quiz.answerRevealAt ? new Date(quiz.answerRevealAt).toLocaleString() : "scheduled";
  if (quiz.answerVisibility === "never") return "never";
  return "after deadline";
}
