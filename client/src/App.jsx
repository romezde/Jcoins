import React, { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2, LogOut, Menu, Search, Shield, X } from "lucide-react";
import { adminTabs, post, request, slug, studentTabs, tabFromPath, teacherTabs } from "./api.js";
import { Field } from "./components/ui.jsx";
import JCoinLogo from "./components/JCoinLogo.jsx";
import Dashboard from "./screens/Dashboard.jsx";
import Leaderboard from "./screens/Leaderboard.jsx";
import People from "./screens/People.jsx";
import Subjects from "./screens/Subjects.jsx";
import Attendance from "./screens/Attendance.jsx";
import Recitation from "./screens/Recitation.jsx";
import Activities from "./screens/Activities.jsx";
import Transactions from "./screens/Transactions.jsx";
import Shop, { StudentShop, StudentTradeRequests } from "./screens/Shop.jsx";
import AppearanceShop, { StudentAppearanceShop } from "./screens/AppearanceShop.jsx";
import Approvals from "./screens/Approvals.jsx";
import Settings from "./screens/Settings.jsx";
import NameWheel from "./screens/NameWheel.jsx";
import { Account, Reports, StudentActivities, StudentHistory, StudentProfile, TeacherProfile } from "./screens/Profiles.jsx";

function useSession() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem("jcoins_session") || "null"));
  function save(next) {
    localStorage.setItem("jcoins_token", next.token);
    localStorage.setItem("jcoins_session", JSON.stringify(next));
    setSession(next);
  }
  function logout() {
    localStorage.removeItem("jcoins_token");
    localStorage.removeItem("jcoins_session");
    setSession(null);
    window.history.pushState({}, "", "/");
  }
  return { session, save, logout };
}

function Login({ onLogin, onPublicLeaderboard }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(() => localStorage.getItem("jcoins_login_notice") || "");
  useEffect(() => {
    if (!notice) return;
    localStorage.removeItem("jcoins_login_notice");
  }, [notice]);
  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try { onLogin(await post("/auth/login", form)); } catch (err) { setError(err.message); setLoading(false); }
  }
  return <main className="login"><section className="login-panel">
    <div className="brand-mark"><JCoinLogo size={42} /> <span>JCoin</span></div><h1>JCoins Arena</h1><p>Teacher dashboard, student profiles, and a live quest board.</p>
    {notice && <div className="notice">{notice}</div>}
    <form onSubmit={submit} aria-busy={loading}><Field label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} /><Field label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />{error && <div className="error">{error}</div>}<button disabled={loading}>{loading ? "Entering..." : "Enter Arena"}</button><button type="button" className="soft" disabled={loading} onClick={onPublicLeaderboard}>View Leaderboard</button></form>
  </section></main>;
}

function ChangePassword({ onDone }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try { onDone(await post("/auth/change-password", form)); } catch (err) { setError(err.message); setLoading(false); }
  }
  return <main className="login"><section className="login-panel"><Shield /><h1>Change Password</h1><p>Create your own password before continuing.</p><form onSubmit={submit} aria-busy={loading}><Field label="Current Password" type="password" value={form.currentPassword} onChange={(v) => setForm({ ...form, currentPassword: v })} /><Field label="New Password" type="password" value={form.newPassword} onChange={(v) => setForm({ ...form, newPassword: v })} />{error && <div className="error">{error}</div>}<button disabled={loading}>{loading ? "Saving..." : "Save Password"}</button></form></section></main>;
}

export default function App() {
  const { session, save, logout } = useSession();
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  function goPublicLeaderboard() {
    window.history.pushState({}, "", "/leaderboard");
    setPath("/leaderboard");
  }
  function goLogin() {
    window.history.pushState({}, "", "/");
    setPath("/");
  }
  if (!session && path.replace(/^\/+/, "").toLowerCase() === "leaderboard") return <PublicLeaderboard onLogin={goLogin} />;
  if (!session) return <Login onLogin={save} onPublicLeaderboard={goPublicLeaderboard} />;
  if (session.user.mustChangePassword) return <ChangePassword onDone={save} />;
  return <RoleApp session={session} logout={logout} />;
}

function PublicLeaderboard({ onLogin }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    request("/leaderboard").then(setData).catch((err) => setError(err.message));
  }, []);
  return <main className="public-board">
    <div className="public-board-top">
      <div className="brand-mark"><JCoinLogo size={34} /> <span>JCoin</span></div>
      <button type="button" onClick={onLogin}>Login</button>
    </div>
    {error ? <section className="panel"><div className="section-title">Could not load leaderboard</div><p className="error">{error}</p></section> : data ? <Leaderboard students={data.students || []} /> : <section className="panel">Loading leaderboard...</section>}
  </main>;
}

function RoleApp({ session, logout }) {
  const tabs = session.user.role === "student" ? studentTabs : session.user.role === "teacher" ? teacherTabs : session.user.role === "display" ? ["Leaderboard"] : adminTabs;
  const fallback = session.user.role === "student" || session.user.role === "display" ? "Leaderboard" : "Dashboard";
  const [active, setActive] = useState(() => tabFromPath(tabs, fallback));
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [successModal, setSuccessModal] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function load() {
    try {
      setLoadError("");
      setData(await request(session.user.role === "student" ? "/student/me" : session.user.role === "display" ? "/leaderboard" : "/admin/overview"));
    } catch (err) {
      setLoadError(err.message);
      if (shouldClearSession(err.message)) {
        localStorage.setItem("jcoins_login_notice", sessionResetMessage(err.message));
        logout();
      }
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    const onPop = () => setActive(tabFromPath(tabs, fallback));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [tabs.join("|"), fallback]);

  function navigate(tab) {
    setActive(tab);
    setNavOpen(false);
    window.history.pushState({}, "", `/${slug(tab)}`);
  }

  async function run(fn, ok = "Saved") {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    setSuccessModal("");
    try {
      await fn();
      await load();
      window.dispatchEvent(new CustomEvent("jcoins:action-success"));
      setSuccessModal(ok);
    } catch (err) {
      setMessage(err.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const normalized = session.user.role === "display" ? { students: data?.students || [], subjects: data?.subjects || [] } : data;
  const home = fallback;
  return <div className={`app-shell ${busy ? "is-busy" : ""}`} aria-busy={busy}>
    <aside className={`sidebar ${navOpen ? "open" : ""}`}>
      <button className="nav-brand brand-button" onClick={() => navigate(home)}><JCoinLogo size={32} /> <span>JCoins</span></button>
      <nav className="module-nav">{tabs.map((tab) => {
        const showDot = tab === "Approvals" && pendingApprovalCount(normalized, session.user.role) > 0;
        return <button key={tab} className={active === tab ? "active" : ""} onClick={() => navigate(tab)}>
          <span>{tab}</span>
          {showDot && <i className="nav-dot" aria-label="Pending requests" />}
        </button>;
      })}</nav>
    </aside>
    <div className="main-pane">
      <header className="topbar">
        <button className="hamburger" onClick={() => setNavOpen(!navOpen)}>{navOpen ? <X /> : <Menu />}</button>
        <GlobalSearch tabs={tabs} data={normalized} navigate={navigate} />
        <NotificationBell role={session.user.role} data={normalized} navigate={navigate} />
        <div className="nav-user"><span>{session.user.role}</span><button onClick={logout}><LogOut size={16} /> Logout</button></div>
      </header>
      {navOpen && <button className="scrim" onClick={() => setNavOpen(false)} aria-label="Close navigation" />}
      <main className="admin-shell">
        {message && <div className="notice">{message}</div>}
        {successModal && <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-card success-modal">
            <CheckCircle2 size={54} />
            <div className="section-title">Success</div>
            <p>{successModal}</p>
            <button type="button" onClick={() => setSuccessModal("")}>OK</button>
          </section>
        </div>}
        {busy && <div className="modal-backdrop loading-backdrop" role="alert" aria-live="polite">
          <section className="modal-card loading-card">
            <div className="loading-spinner" />
            <div>
              <div className="section-title">Working...</div>
              <p>Please wait while JCoins saves your change.</p>
            </div>
          </section>
        </div>}
        {!normalized ? <section className="panel">{loadError ? <><div className="section-title">Could not load data</div><p className="error">{loadError}</p><button onClick={logout}>Back to Login</button></> : "Loading..."}</section> : <Screen role={session.user.role} tab={active} data={normalized} run={run} />}
      </main>
    </div>
  </div>;
}

function shouldClearSession(message = "") {
  return ["Invalid token", "Missing token", "Forbidden"].includes(message)
    || message.includes("Server took too long")
    || message.includes("Failed to fetch")
    || message.includes("NetworkError")
    || message.includes("Load failed");
}

function sessionResetMessage(message = "") {
  if (["Invalid token", "Missing token", "Forbidden"].includes(message)) return "Your session expired. Please log in again.";
  return "The backend was offline or still waking up, so the app cleared the stuck session. Refresh after a few seconds, then log in again.";
}

function GlobalSearch({ tabs, data, navigate }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = q ? buildSearchResults(tabs, data).filter((item) => item.search.includes(q)).slice(0, 10) : [];

  function choose(tab) {
    navigate(tab);
    setQuery("");
  }

  return <div className="global-search">
    <Search size={17} />
    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search modules, students, shop..." />
    {results.length > 0 && <div className="global-search-results">
      {results.map((item, index) => <button key={`${item.type}-${item.label}-${index}`} onClick={() => choose(item.tab)}>
        <span>{item.label}</span>
        <small>{item.type} | {item.tab}</small>
      </button>)}
    </div>}
  </div>;
}

function NotificationBell({ role, data, navigate }) {
  const [open, setOpen] = useState(false);
  const items = notificationItems(role, data);
  const hasDot = items.length > 0;

  function openTarget(item) {
    if (item.tab) navigate(item.tab);
    setOpen(false);
  }

  return <div className="notification-wrap">
    <button type="button" className="notification-button soft" onClick={() => setOpen(!open)} aria-label="Notifications">
      <Bell size={18} />
      {hasDot && <i className="notification-dot" />}
    </button>
    {open && <div className="notification-menu">
      <div className="notification-head">
        <strong>Notifications</strong>
        {hasDot && <span>{items.length}</span>}
      </div>
      {items.length ? items.slice(0, 8).map((item) => <button type="button" key={item.id} onClick={() => openTarget(item)}>
        <strong>{item.title}</strong>
        <span>{item.detail}</span>
        <small>{item.date}</small>
      </button>) : <p>No notifications right now.</p>}
    </div>}
  </div>;
}

function notificationItems(role, data) {
  const requests = data?.requests || [];
  if (role === "admin" || role === "teacher") {
    return requests
      .filter((request) => request.status === "pending")
      .map((request) => ({
        id: request.id,
        tab: "Approvals",
        title: `${request.type} request`,
        detail: `${request.studentName || "Student"}${request.itemName ? ` - ${request.itemName}` : request.toStudentName ? ` - Trade with ${request.toStudentName}` : ""}`,
        date: new Date(request.createdAt).toLocaleString()
      }));
  }
  if (role === "student") {
    return requests
      .filter((request) => ["approved", "rejected"].includes(request.status))
      .map((request) => ({
        id: request.id,
        tab: request.type === "trade" ? "Trade Requests" : "Shop",
        title: `${request.status.toUpperCase()} ${request.type}`,
        detail: request.itemName || (request.toStudentName ? `Trade with ${request.toStudentName}` : request.remarks || "Request result"),
        date: new Date(request.resolvedAt || request.createdAt).toLocaleString()
      }));
  }
  return [];
}

function pendingApprovalCount(data, role) {
  if (role !== "admin" && role !== "teacher") return 0;
  return (data?.requests || []).filter((request) => request.status === "pending").length;
}

function buildSearchResults(tabs, data) {
  const add = (list, type, label, tab, extra = "") => {
    if (!tabs.includes(tab)) return;
    list.push({ type, label, tab, search: `${type} ${label} ${tab} ${extra}`.toLowerCase() });
  };
  const list = [];
  tabs.forEach((tab) => add(list, "Module", tab, tab));
  (data?.students || []).forEach((student) => add(list, "Student", `${student.name}${student.username ? ` (${student.username})` : ""}`, "People", `${student.section} ${student.rank}`));
  (data?.subjects || []).forEach((subject) => add(list, "Subject", subject.name, tabs.includes("Subjects") ? "Subjects" : "Leaderboard"));
  (data?.activities || []).forEach((activity) => add(list, "Activity", activity.title, "Activities", `${activity.subjectName} ${activity.type}`));
  (data?.shopItems || []).forEach((item) => add(list, "Shop Item", item.name, "Shop", `${item.tier} ${item.cost} ${item.notes}`));
  (data?.appearanceItems || []).forEach((item) => add(list, "Appearance", item.name, "Appearance Shop", `${item.type} ${item.tier} ${item.price} ${item.preview}`));
  (data?.users || []).forEach((user) => add(list, "Account", user.username, "People", `${user.role} ${(user.sectionIds || []).join(" ")}`));
  (data?.attendanceWeeks || []).forEach((week) => add(list, "Attendance", week.title, "Attendance", week.subjectName));
  return list;
}

function Screen({ role, tab, data, run }) {
  if (tab === "Leaderboard") return <Leaderboard students={data.students || []} currentStudentId={data.student?.id} />;
  if (tab === "Dashboard") return <Dashboard data={data} />;
  if (tab === "People") return <People data={data} run={run} role={role} />;
  if (tab === "Subjects") return <Subjects data={data} run={run} />;
  if (tab === "Attendance") return <Attendance data={data} run={run} />;
  if (tab === "Recitation") return <Recitation data={data} run={run} />;
  if (tab === "Activities") return role === "student" ? <StudentActivities data={data} /> : <Activities data={data} run={run} />;
  if (tab === "Transactions") return <Transactions data={data} run={run} />;
  if (tab === "Shop") return role === "student" ? <StudentShop data={data} run={run} /> : <Shop data={data} run={run} />;
  if (tab === "Trade Requests") return <StudentTradeRequests data={data} run={run} />;
  if (tab === "Appearance Shop") return role === "student" ? <StudentAppearanceShop data={data} run={run} /> : <AppearanceShop data={data} run={run} />;
  if (tab === "Approvals") return <Approvals data={data} run={run} />;
  if (tab === "Settings") return <Settings data={data} run={run} />;
  if (tab === "Name Wheel") return <NameWheel data={data} />;
  if (tab === "History") return <StudentHistory data={data} />;
  if (tab === "Profile") return role === "student" ? <StudentProfile data={data} run={run} /> : <TeacherProfile data={data} />;
  if (tab === "Reports") return <Reports data={data} />;
  if (tab === "Account") return <Account data={data} role={role} />;
  return <section className="panel">Prototype screen coming next.</section>;
}
