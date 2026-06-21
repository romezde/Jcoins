import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import PwaRuntimeStatus from "./components/PwaRuntimeStatus.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(<><App /><PwaRuntimeStatus /></>);

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
