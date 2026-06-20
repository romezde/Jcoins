import React, { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2, Download, LogOut, Menu, Search, Shield, X } from "lucide-react";
import { adminTabs, eventUrl, post, request, slug, studentAssistantTabs, studentTabs, tabFromPath, teacherTabs } from "./api.js";
import { DropdownChecklist, Field, Select } from "./components/ui.jsx";
import JCoinLogo from "./components/JCoinLogo.jsx";
import Dashboard from "./screens/Dashboard.jsx";
import Leaderboard from "./screens/Leaderboard.jsx";
import People from "./screens/People.jsx";
import Subjects from "./screens/Subjects.jsx";
import Attendance from "./screens/Attendance.jsx";
import Recitation from "./screens/Recitation.jsx";
import Activities from "./screens/Activities.jsx";
import Quizzes from "./screens/Quizzes.jsx";
import Transactions from "./screens/Transactions.jsx";
import Shop, { StudentShop, StudentTradeRequests } from "./screens/Shop.jsx";
import AppearanceShop, { StudentAppearanceShop } from "./screens/AppearanceShop.jsx";
import Approvals from "./screens/Approvals.jsx";
import Settings from "./screens/Settings.jsx";
import NameWheel from "./screens/NameWheel.jsx";
import { StaffFeedback, StudentFeedback } from "./screens/Feedback.jsx";
import Schedule from "./screens/Schedule.jsx";
import { Account, Reports, StudentActivities, StudentHistory, StudentProfile, TeacherProfile } from "./screens/Profiles.jsx";
import GuildAffinity from "./screens/GuildAffinity.jsx";
import FloatingAssistant from "./components/FloatingAssistant.jsx";

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
  const [registrationOptions, setRegistrationOptions] = useState(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  useEffect(() => {
    if (!notice) return;
    localStorage.removeItem("jcoins_login_notice");
  }, [notice]);
  useEffect(() => {
    request("/registration/options").then(setRegistrationOptions).catch(() => setRegistrationOptions({ enabled: false, sections: [], subjects: [] }));
  }, []);
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
    <form onSubmit={submit} aria-busy={loading}><Field label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} /><Field label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />{error && <div className="error">{error}</div>}<button disabled={loading}>{loading ? "Entering..." : "Enter Arena"}</button><button type="button" className="soft" disabled={loading} onClick={onPublicLeaderboard}>View Leaderboard</button>{registrationOptions?.enabled && <button type="button" className="soft" disabled={loading} onClick={() => setRegisterOpen(true)}>Create Student Account</button>}</form>
    {registerOpen && <StudentRegistrationModal options={registrationOptions} onClose={() => setRegisterOpen(false)} onSubmitted={(message) => { setNotice(message); setRegisterOpen(false); }} />}
  </section></main>;
}

function StudentRegistrationModal({ options, onClose, onSubmitted }) {
  const [form, setForm] = useState({ surname: "", firstName: "", middleName: "", password: "", section: options.sections?.[0] || "", subjectIds: [], registrationCode: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const username = registrationUsername(form);
  const fullName = `${form.surname.trim()}, ${[form.firstName.trim(), form.middleName.trim()].filter(Boolean).join(" ")}`.trim();

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const result = await post("/auth/register-student", form);
      onSubmitted(`Account created. Your username is ${result.username}. You can log in now.`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const setUpper = (key, value) => setForm({ ...form, [key]: value.toUpperCase() });
  return <div className="modal-backdrop" role="dialog" aria-modal="true">
    <section className="modal-card modal-card-wide">
      <div className="section-head">
        <div className="section-title">Create Student Account</div>
        <button type="button" className="soft" onClick={onClose}>Close</button>
      </div>
      <form onSubmit={submit}>
        <div className="form-grid two">
          <Field label="Surname" value={form.surname} onChange={(value) => setUpper("surname", value)} />
          <Field label="First Name" value={form.firstName} onChange={(value) => setUpper("firstName", value)} />
          <Field label="Middle Name" value={form.middleName} onChange={(value) => setUpper("middleName", value)} />
          <Field label="Password" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
          <Select label="Section" value={form.section} onChange={(section) => setForm({ ...form, section })} options={(options.sections || []).map((section) => ({ value: section, label: section }))} />
          <Field label="Registration Code" value={form.registrationCode} onChange={(registrationCode) => setForm({ ...form, registrationCode })} />
        </div>
        <DropdownChecklist label="Subjects" items={options.subjects || []} selected={form.subjectIds} onChange={(subjectIds) => setForm({ ...form, subjectIds })} />
        <div className="notice">Username: {username || "surname.firstname"}</div>
        <p className="muted-line">Name will be saved as {fullName || "SURNAME, FIRST NAME MIDDLE NAME"}.</p>
        {error && <div className="error">{error}</div>}
        <button disabled={busy || !form.surname.trim() || !form.firstName.trim() || form.password.length < 6 || !form.section || !form.subjectIds.length}>{busy ? "Creating..." : "Create Account"}</button>
      </form>
    </section>
  </div>;
}

function registrationUsername(form) {
  const clean = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const surname = clean(form.surname);
  const first = clean(form.firstName);
  return surname && first ? `${surname}.${first}` : "";
}

function msUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 2, 0);
  return Math.max(1000, next.getTime() - now.getTime());
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
  const baseTabs = session.user.role === "student" ? studentTabs : session.user.role === "teacher" ? teacherTabs : session.user.role === "display" ? ["Leaderboard"] : adminTabs;
  const fallback = session.user.role === "teacher" ? "Schedule" : session.user.role === "student" || session.user.role === "display" ? "Leaderboard" : "Dashboard";
  const [active, setActive] = useState(() => tabFromPath(baseTabs, fallback));
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [successModal, setSuccessModal] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [liveStatus, setLiveStatus] = useState("connecting");
  const [navOpen, setNavOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const loadInFlightRef = useRef(false);
  const pendingLoadRef = useRef(false);
  const pendingModulesRef = useRef(new Set());
  const realtimeTimerRef = useRef(null);
  const loadedModulesRef = useRef(new Set());
  const normalized = session.user.role === "display" ? { students: data?.students || [], subjects: data?.subjects || [] } : data;
  const tabs = buildTabs(baseTabs, normalized, session.user.role);

  async function load(modules = []) {
    if (loadInFlightRef.current) {
      pendingLoadRef.current = true;
      modules.forEach((module) => pendingModulesRef.current.add(module));
      return;
    }
    loadInFlightRef.current = true;
    try {
      setLoadError("");
      const nextModules = new Set([...loadedModulesRef.current, ...modules]);
      const query = nextModules.size ? `?modules=${encodeURIComponent([...nextModules].join(","))}` : "";
      const path = session.user.role === "student" ? `/student/me${query}` : session.user.role === "display" ? "/leaderboard" : `/admin/overview${query}`;
      setData(await request(path));
      loadedModulesRef.current = nextModules;
      setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (err) {
      setLoadError(err.message);
      if (shouldClearSession(err.message)) {
        localStorage.setItem("jcoins_login_notice", sessionResetMessage(err.message));
        logout();
      }
    } finally {
      loadInFlightRef.current = false;
      if (pendingLoadRef.current) {
        const pendingModules = [...pendingModulesRef.current];
        pendingModulesRef.current = new Set();
        pendingLoadRef.current = false;
        window.setTimeout(() => load(pendingModules), 50);
      }
    }
  }

  useEffect(() => { load(requiredModulesForTab(active, session.user.role)); }, []);
  useEffect(() => {
    const needed = requiredModulesForTab(active, session.user.role);
    if (needed.some((module) => !loadedModulesRef.current.has(module))) load(needed);
  }, [active, session.user.role]);
  useEffect(() => {
    const scheduleRefresh = (delay = 900) => {
      window.clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = window.setTimeout(() => {
        if (document.visibilityState === "visible") load();
      }, delay);
    };
    const pollTimer = window.setInterval(() => scheduleRefresh(0), document.visibilityState === "visible" ? 60000 : 180000);
    let midnightTimer = null;
    let source = null;
    let reconnectTimer = null;
    let cancelled = false;
    const scheduleMidnightRefresh = () => {
      window.clearTimeout(midnightTimer);
      midnightTimer = window.setTimeout(() => {
        scheduleRefresh(0);
        scheduleMidnightRefresh();
      }, msUntilNextMidnight());
    };
    const connectRealtime = () => {
      request("/events/token").then(({ token }) => {
        if (cancelled || !token) return;
        if (source) source.close();
        source = new EventSource(eventUrl(token));
        source.addEventListener("ready", () => setLiveStatus("live"));
        source.addEventListener("open", () => setLiveStatus("live"));
        source.addEventListener("change", () => {
          setLiveStatus("live");
          scheduleRefresh();
        });
        source.addEventListener("error", () => {
          setLiveStatus("reconnecting");
          if (source) source.close();
          window.clearTimeout(reconnectTimer);
          reconnectTimer = window.setTimeout(() => {
            if (!cancelled) connectRealtime();
          }, 5000);
        });
      }).catch(() => {
        setLiveStatus("polling");
        window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(() => {
          if (!cancelled) connectRealtime();
        }, 15000);
      });
    };
    if (window.EventSource && localStorage.getItem("jcoins_token")) {
      connectRealtime();
    } else {
      setLiveStatus("polling");
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh(0);
    };
    const onOnline = () => scheduleRefresh(0);
    scheduleMidnightRefresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.clearTimeout(realtimeTimerRef.current);
      window.clearTimeout(midnightTimer);
      window.clearTimeout(reconnectTimer);
      window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      if (source) source.close();
    };
  }, [session.user.id, session.user.role]);
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

  useEffect(() => {
    const openModuleAction = (event) => {
      const { tab, openEvent, prefillEvent, detail } = event.detail || {};
      if (!tab || !tabs.includes(tab)) return;
      navigate(tab);
      window.setTimeout(() => {
        if (prefillEvent) window.dispatchEvent(new CustomEvent(prefillEvent, { detail }));
        if (openEvent) window.dispatchEvent(new CustomEvent(openEvent, { detail }));
      }, 120);
    };
    window.addEventListener("jcoins:open-module-action", openModuleAction);
    return () => window.removeEventListener("jcoins:open-module-action", openModuleAction);
  }, [tabs.join("|")]);

  async function run(fn, ok = "Saved") {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    setSuccessModal("");
    try {
      const result = await fn();
      await load(requiredModulesForTab(active, session.user.role));
      window.dispatchEvent(new CustomEvent("jcoins:action-success"));
      setSuccessModal(ok);
      return result ?? true;
    } catch (err) {
      setMessage(err.message);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const home = fallback;
  return <div className={`app-shell ${busy ? "is-busy" : ""}`} aria-busy={busy}>
    <aside className={`sidebar ${navOpen ? "open" : ""}`}>
      <button className="nav-brand brand-button" onClick={() => navigate(home)}><JCoinLogo size={32} /> <span>JCoins</span></button>
      <nav className="module-nav">{tabs.map((tab) => {
        const showDot = (tab === "Approvals" && pendingApprovalCount(normalized, session.user.role) > 0)
          || (tab === "Feedback" && pendingFeedbackCount(normalized, session.user.role) > 0);
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
        <InstallAppButton />
        <NotificationBell role={session.user.role} userId={session.user.id} data={normalized} navigate={navigate} />
        <LiveStatus status={liveStatus} lastUpdated={lastUpdated} />
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
    {(session.user.role === "admin" || session.user.role === "teacher") && <FloatingAssistant />}
  </div>;
}

function LiveStatus({ status, lastUpdated }) {
  const label = status === "live" ? "Live" : status === "polling" ? "Backup" : "Reconnecting";
  return <div className={`live-status ${status}`}>
    <i />
    <span>{label}</span>
    {lastUpdated && <small>{lastUpdated}</small>}
  </div>;
}

function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [visible, setVisible] = useState(() => !isStandaloneApp());
  const [tip, setTip] = useState("");

  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault();
      setPromptEvent(event);
      setVisible(!isStandaloneApp());
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setVisible(false);
      setTip("");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  async function install() {
    if (isStandaloneApp()) {
      setVisible(false);
      return;
    }
    if (promptEvent) {
      promptEvent.prompt();
      const choice = await promptEvent.userChoice.catch(() => null);
      setPromptEvent(null);
      if (choice?.outcome === "accepted") setVisible(false);
      return;
    }
    setTip(isIOSDevice()
      ? "On iPhone or iPad: tap Share, then choose Add to Home Screen."
      : "Use your browser menu, then choose Install app or Add to Home Screen.");
  }

  return <>
    <button type="button" className="soft install-button" onClick={install} title="Install JCoins">
      <Download size={16} />
      <span>Install</span>
    </button>
    {tip && <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card install-tip-card">
        <div className="section-title">Install JCoins</div>
        <p>{tip}</p>
        <button type="button" onClick={() => setTip("")}>OK</button>
      </section>
    </div>}
  </>;
}

function isStandaloneApp() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function isIOSDevice() {
  const platform = window.navigator.platform || "";
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) || (platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

function shouldClearSession(message = "") {
  return ["Invalid token", "Missing token", "Unauthorized", "Forbidden"].includes(message);
}

function sessionResetMessage(message = "") {
  if (["Invalid token", "Missing token", "Unauthorized", "Forbidden"].includes(message)) return "Your session expired. Please log in again.";
  return "The app could not reach the server. Refresh after a few seconds and try again.";
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

function NotificationBell({ role, userId, data, navigate }) {
  const [open, setOpen] = useState(false);
  const readKey = `jcoins_notifications_read_${userId || role}`;
  const [readIds, setReadIds] = useState(() => JSON.parse(localStorage.getItem(readKey) || "[]"));
  const items = notificationItems(role, data);
  const unreadItems = items.filter((item) => !readIds.includes(item.id));
  const hasDot = unreadItems.length > 0;

  function toggleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && unreadItems.length) {
      const nextReadIds = [...new Set([...readIds, ...items.map((item) => item.id)])].slice(-120);
      setReadIds(nextReadIds);
      localStorage.setItem(readKey, JSON.stringify(nextReadIds));
    }
  }

  function openTarget(item) {
    if (item.tab) navigate(item.tab);
    setOpen(false);
  }

  return <div className="notification-wrap">
    <button type="button" className="notification-button soft" onClick={toggleOpen} aria-label="Notifications">
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
    const requestItems = requests
      .filter((request) => request.status === "pending" || (request.type === "registration" && request.status === "created"))
      .map((request) => ({
        id: request.id,
        tab: "Approvals",
        title: request.type === "registration" && request.status === "created" ? "Student registered" : `${request.type} request`,
        detail: `${request.studentName || "Student"}${request.itemName ? ` - ${request.itemName}` : request.toStudentName ? ` - Trade with ${request.toStudentName}` : ""}`,
        date: new Date(request.createdAt).toLocaleString()
      }));
    const feedbackItems = (data?.feedback || [])
      .filter((entry) => entry.status === "New")
      .map((entry) => ({
        id: `feedback-${entry.id}`,
        tab: "Feedback",
        title: `${entry.category}`,
        detail: `${entry.studentName || "Student"} - ${entry.title}`,
        date: new Date(entry.createdAt).toLocaleString()
      }));
    return [...requestItems, ...feedbackItems].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }
  if (role === "student") {
    const requestItems = requests
      .filter((request) => ["approved", "rejected"].includes(request.status))
      .map((request) => ({
        id: request.id,
        tab: request.type === "trade" ? "Trade Requests" : "Shop",
        title: `${request.status.toUpperCase()} ${request.type}`,
        detail: request.itemName || (request.toStudentName ? `Trade with ${request.toStudentName}` : request.remarks || "Request result"),
        date: new Date(request.resolvedAt || request.createdAt).toLocaleString()
      }));
    const feedbackItems = (data?.feedback || [])
      .filter((entry) => ["Planned", "Fixed", "Rejected", "Duplicate"].includes(entry.status))
      .map((entry) => ({
        id: `feedback-${entry.id}`,
        tab: "Feedback",
        title: `FEEDBACK ${entry.status.toUpperCase()}`,
        detail: entry.title,
        date: new Date(entry.statusChangedAt || entry.updatedAt || entry.createdAt).toLocaleString()
      }));
    return [...requestItems, ...feedbackItems].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }
  return [];
}

function pendingApprovalCount(data, role) {
  if (role !== "admin" && role !== "teacher") return 0;
  return (data?.requests || []).filter((request) => request.status === "pending").length;
}

function pendingFeedbackCount(data, role) {
  if (role !== "admin" && role !== "teacher") return 0;
  return (data?.feedback || []).filter((entry) => entry.status === "New").length;
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
  (data?.feedback || []).forEach((entry) => add(list, "Feedback", entry.title, "Feedback", `${entry.studentName} ${entry.category} ${entry.status} ${entry.feature}`));
  (data?.schedules || []).forEach((schedule) => add(list, "Schedule", `${schedule.subjectName} ${schedule.day}`, "Schedule", `${schedule.section} ${schedule.startTime} ${schedule.endTime} ${schedule.room} ${schedule.type}`));
  (data?.guildSystem?.students || []).forEach((student) => add(list, "Guild", student.studentName, "Guild Affinity", `${student.section} ${student.status}`));
  return list;
}

function requiredModulesForTab(tab, role) {
  if (role === "display") return [];
  if (tab === "Leaderboard" && role === "student") return ["guild"];
  const map = {
    Dashboard: ["dashboard"],
    Schedule: ["schedule"],
    "Guild Affinity": ["guild"],
    People: ["people"],
    Attendance: ["attendance"],
    Recitation: ["recitations"],
    Activities: ["activities"],
    Quizzes: ["quizzes"],
    Transactions: ["transactions"],
    Shop: ["shop"],
    "Trade Requests": ["shop"],
    "Appearance Shop": ["appearance"],
    Approvals: ["requests"],
    Feedback: ["feedback"],
    Settings: ["settings", "guild"],
    History: ["transactions"],
    Profile: role === "student" ? ["profile", "transactions"] : [],
    Reports: ["transactions", "recitations", "activities"]
  };
  return map[tab] || [];
}

function Screen({ role, tab, data, run }) {
  const assistantData = role === "student" && studentAssistantTabs.includes(tab) ? studentAssistantData(data) : data;
  if (tab === "Leaderboard") return <Leaderboard students={data.students || []} currentStudentId={data.student?.id} role={role} />;
  if (tab === "Dashboard") return <Dashboard data={data} />;
  if (tab === "Schedule") return <Schedule data={data} run={run} role={role} />;
  if (tab === "Guild Affinity") return <GuildAffinity data={data} run={run} role={role} />;
  if (tab === "People") return <People data={data} run={run} role={role} />;
  if (tab === "Subjects") return <Subjects data={data} run={run} />;
  if (tab === "Attendance") return <Attendance data={assistantData} run={run} role={role} />;
  if (tab === "Recitation") return <Recitation data={assistantData} run={run} />;
  if (tab === "Activities") return role === "student" ? <StudentActivities data={data} run={run} /> : <Activities data={data} run={run} />;
  if (tab === "Quizzes") return <Quizzes data={data} run={run} role={role} />;
  if (tab === "Transactions") return <Transactions data={assistantData} run={run} role={role} />;
  if (tab === "Shop") return role === "student" ? <StudentShop data={data} run={run} /> : <Shop data={data} run={run} />;
  if (tab === "Trade Requests") return <StudentTradeRequests data={data} run={run} />;
  if (tab === "Appearance Shop") return role === "student" ? <StudentAppearanceShop data={data} run={run} /> : <AppearanceShop data={data} run={run} />;
  if (tab === "Approvals") return <Approvals data={data} run={run} />;
  if (tab === "Feedback") return role === "student" ? <StudentFeedback data={data} run={run} /> : <StaffFeedback data={data} run={run} />;
  if (tab === "Settings") return <Settings data={data} run={run} />;
  if (tab === "Name Wheel") return <NameWheel data={data} />;
  if (tab === "History") return <StudentHistory data={data} />;
  if (tab === "Profile") return role === "student" ? <StudentProfile data={data} run={run} /> : <TeacherProfile data={data} />;
  if (tab === "Reports") return <Reports data={data} />;
  if (tab === "Account") return <Account data={data} role={role} />;
  return <section className="panel">Prototype screen coming next.</section>;
}

function buildTabs(baseTabs, data, role) {
  let tabs = role === "student" && shouldShowGuildTab(data) ? insertTab(baseTabs, "Leaderboard", "Guild Affinity") : baseTabs;
  if (role === "student" && data?.assistantAccess?.active) {
    [...studentAssistantTabs].reverse().forEach((tab) => {
      tabs = insertTab(tabs, "Schedule", tab);
    });
  }
  return tabs;
}

function studentAssistantData(data) {
  const access = data?.assistantAccess || {};
  if (!access.active) return data;
  return {
    ...data,
    students: access.students || [],
    attendanceWeeks: (data.attendanceWeeks || []).filter((week) => weekOverlapsAssignment(week, access.assignment)),
    transactions: access.transactions || [],
    attendanceRecords: access.attendanceRecords || [],
    recitations: access.recitations || []
  };
}

function weekOverlapsAssignment(week, assignment) {
  if (!assignment) return true;
  return (week.dates || []).some((date) => date >= assignment.weekStart && date <= assignment.weekEnd);
}

function insertTab(tabs, after, tab) {
  if (tabs.includes(tab)) return tabs;
  const index = tabs.indexOf(after);
  if (index < 0) return [...tabs, tab];
  return [...tabs.slice(0, index + 1), tab, ...tabs.slice(index + 1)];
}

function shouldShowGuildTab(data) {
  const guild = data?.guildSystem;
  return guild?.status === "open" || !!guild?.response;
}
