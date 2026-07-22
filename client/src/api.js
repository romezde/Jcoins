const configuredApi = import.meta.env.VITE_API_URL || "";
const retiredRenderApi = "https://jcoins.onrender.com/api";
const localServerApi = "https://deguzman.tail6a3597.ts.net/api";
export const API = configuredApi === retiredRenderApi ? localServerApi : configuredApi || (import.meta.env.PROD ? localServerApi : "/api");

export const adminTabs = ["Dashboard", "Schedule", "Leaderboard", "Guild Affinity", "Students", "Teachers", "Student Assistants", "Sections", "Subjects", "Attendance", "Recitation", "Activities", "Quizzes", "Major Exams", "Grades", "Transactions", "Shop", "Appearance Shop", "Approvals", "History", "Feedback", "Settings", "Name Wheel", "Profile", "Account"];
export const teacherTabs = ["Schedule", "Dashboard", "Leaderboard", "Guild Affinity", "Students", "Student Assistants", "Sections", "Attendance", "Recitation", "Activities", "Quizzes", "Major Exams", "Grades", "Transactions", "Approvals", "Feedback", "Reports", "History", "Name Wheel", "Profile", "Account"];
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
  const { timeoutMs = 90000, ...fetchOptions } = options;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(`${API}${path}`, {
    ...fetchOptions,
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

export function postForm(path, formData, timeoutMs = 90000) {
  if (!navigator.onLine) return Promise.reject(new Error("You are offline. Reconnect before uploading."));
  const token = localStorage.getItem("jcoins_token");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
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

export function postFormWithProgress(path, formData, onProgress, timeoutMs = 10 * 60 * 1000) {
  if (!navigator.onLine) return Promise.reject(new Error("You are offline. Reconnect before uploading."));
  const token = localStorage.getItem("jcoins_token");
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}${path}`);
    xhr.timeout = timeoutMs;
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.min(99, Math.round(event.loaded / event.total * 100)));
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || "{}"); } catch { /* Keep the fallback message below. */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(data);
      } else {
        reject(new Error(data.error || "Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.ontimeout = () => reject(new Error("Upload took too long. Check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload was cancelled."));
    xhr.send(formData);
  });
}
