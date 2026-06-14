export const API = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:4000/api`;

export const adminTabs = ["Dashboard", "Leaderboard", "People", "Subjects", "Attendance", "Recitation", "Activities", "Transactions", "Shop", "Appearance Shop", "Approvals", "Feedback", "Settings", "Name Wheel", "Profile", "Account"];
export const teacherTabs = ["Dashboard", "Leaderboard", "People", "Attendance", "Recitation", "Activities", "Transactions", "Approvals", "Feedback", "Reports", "Name Wheel", "Profile", "Account"];
export const studentTabs = ["Leaderboard", "Profile", "Activities", "Shop", "Trade Requests", "Appearance Shop", "Feedback", "History", "Account"];

export function slug(tab) {
  return tab.toLowerCase().replaceAll(" ", "-");
}

export function tabFromPath(tabs, fallback) {
  const current = window.location.pathname.replace(/^\/+/, "").replaceAll("-", " ");
  return tabs.find((tab) => tab.toLowerCase() === current.toLowerCase()) || fallback;
}

export function request(path, options = {}) {
  const token = localStorage.getItem("jcoins_token");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);
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
    if (err.name === "AbortError") throw new Error("Server took too long to respond. Render may still be waking up. Please refresh and try again.");
    throw err;
  }).finally(() => {
    window.clearTimeout(timeout);
  });
}

export const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });
export const put = (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) });
export const del = (path) => request(path, { method: "DELETE" });
export const today = () => new Date().toISOString().slice(0, 10);
