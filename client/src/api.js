export const API = import.meta.env.VITE_API_URL || "/api";

export const adminTabs = ["Dashboard", "Schedule", "Leaderboard", "Guild Affinity", "People", "Subjects", "Attendance", "Recitation", "Activities", "Quizzes", "Transactions", "Shop", "Appearance Shop", "Approvals", "Audit Logs", "Feedback", "Settings", "Name Wheel", "Profile", "Account"];
export const teacherTabs = ["Schedule", "Dashboard", "Leaderboard", "Guild Affinity", "People", "Attendance", "Recitation", "Activities", "Quizzes", "Transactions", "Approvals", "Feedback", "Reports", "Name Wheel", "Profile", "Account"];
export const studentTabs = ["Leaderboard", "Schedule", "Profile", "Activities", "Quizzes", "Shop", "Trade Requests", "Appearance Shop", "Feedback", "History", "Account"];
export const studentAssistantTabs = ["Attendance", "Recitation", "Transactions"];

export function slug(tab) {
  return tab.toLowerCase().replaceAll(" ", "-");
}

export function tabFromPath(tabs, fallback) {
  const current = window.location.pathname.replace(/^\/+/, "").replaceAll("-", " ");
  return tabs.find((tab) => tab.toLowerCase() === current.toLowerCase()) || fallback;
}

export function request(path, options = {}) {
  if (!navigator.onLine) return Promise.reject(new Error("You are offline. Reconnect before saving or refreshing."));
  const token = localStorage.getItem("jcoins_token");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 90000);
  return fetch(`${API}${path}`, {
    ...options,
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }).catch((err) => {
    if (err.name === "AbortError") throw new Error("Server took too long to respond. Please refresh and try again.");
    throw err;
  }).finally(() => {
    window.clearTimeout(timeout);
  });
}

export const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });
export const put = (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) });
export const del = (path) => request(path, { method: "DELETE" });
export const today = () => new Date().toISOString().slice(0, 10);

export function eventUrl(token) {
  return `${API}/events?token=${encodeURIComponent(token)}`;
}

export function postForm(path, formData) {
  if (!navigator.onLine) return Promise.reject(new Error("You are offline. Reconnect before uploading."));
  const token = localStorage.getItem("jcoins_token");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 90000);
  return fetch(`${API}${path}`, {
    method: "POST",
    signal: controller.signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }).catch((err) => {
    if (err.name === "AbortError") throw new Error("AI took too long to respond. Please try a shorter file or prompt.");
    throw err;
  }).finally(() => {
    window.clearTimeout(timeout);
  });
}
