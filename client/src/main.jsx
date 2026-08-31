import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import PwaRuntimeStatus from "./components/PwaRuntimeStatus.jsx";
import "./styles.css";

class RuntimeErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, repairing: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("JCoins runtime error", error, info);
    if (sessionStorage.getItem("jcoins_runtime_recovery") === "1") return;
    sessionStorage.setItem("jcoins_runtime_recovery", "1");
    this.setState({ repairing: true });
    repairRuntimeCache().finally(() => window.location.reload());
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="login"><section className="login-panel runtime-recovery-panel">
      <h1>{this.state.repairing ? "Repairing JCoins" : "JCoins needs to reload"}</h1>
      <p>{this.state.repairing ? "Removing an outdated app cache. This page will reload automatically." : "The app could not finish loading. Your saved JCoins data is safe."}</p>
      {!this.state.repairing && <button type="button" onClick={() => repairRuntimeCache().finally(() => window.location.reload())}>Repair and Reload</button>}
    </section></main>;
  }
}

async function repairRuntimeCache() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("jcoins_overview_cache_") || key.startsWith("jcoins_nav_groups_") || key.startsWith("jcoins_notifications_read_"))
      .forEach((key) => localStorage.removeItem(key));
  } catch {}
  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("jcoins-shell-")).map((key) => caches.delete(key)));
    } catch {}
  }
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch {}
  }
}

createRoot(document.getElementById("root")).render(<RuntimeErrorBoundary><App /><PwaRuntimeStatus /></RuntimeErrorBoundary>);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      const announceUpdate = () => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent("jcoins:update-ready", { detail: { registration } }));
        }
      };
      announceUpdate();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed") announceUpdate();
        });
      });
      const checkForUpdate = () => {
        if (document.visibilityState === "visible" && navigator.onLine) registration.update().catch(() => {});
      };
      document.addEventListener("visibilitychange", checkForUpdate);
      window.setInterval(checkForUpdate, 60 * 60 * 1000);
    }).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (sessionStorage.getItem("jcoins_apply_update") !== "1") return;
      sessionStorage.removeItem("jcoins_apply_update");
      window.location.reload();
    });
  });
}
