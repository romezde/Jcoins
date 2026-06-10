export const API = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:4000/api`;

export const adminTabs = ["Dashboard", "Leaderboard", "People", "Subjects", "Attendance", "Recitation", "Activities", "Transactions", "Shop", "Approvals", "Settings", "Profile"];
export const teacherTabs = ["Dashboard", "Leaderboard", "People", "Attendance", "Recitation", "Activities", "Transactions", "Approvals", "Reports", "Profile"];
export const studentTabs = ["Leaderboard", "Profile", "Activities", "Shop", "History", "Account"];

export function slug(tab) {
  return tab.toLowerCase().replaceAll(" ", "-");
}

export function tabFromPath(tabs, fallback) {
  const current = window.location.pathname.replace(/^\/+/, "").replaceAll("-", " ");
  return tabs.find((tab) => tab.toLowerCase() === current.toLowerCase()) || fallback;
}

export function request(path, options = {}) {
  const token = localStorage.getItem("jcoins_token");
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  });
}

export const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });
export const put = (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) });
export const del = (path) => request(path, { method: "DELETE" });
export const today = () => new Date().toISOString().slice(0, 10);
