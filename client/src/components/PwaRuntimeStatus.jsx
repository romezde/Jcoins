import React, { useEffect, useState } from "react";
import { RefreshCw, WifiOff, X } from "lucide-react";

export default function PwaRuntimeStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onUpdate = (event) => setRegistration(event.detail?.registration || null);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("jcoins:update-ready", onUpdate);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("jcoins:update-ready", onUpdate);
    };
  }, []);

  function applyUpdate() {
    if (!registration?.waiting) return;
    sessionStorage.setItem("jcoins_apply_update", "1");
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }

  if (online && !registration) return null;
  return <div className={`pwa-runtime-status ${online ? "update" : "offline"}`} role="status" aria-live="polite">
    {!online ? <><WifiOff size={17} /><span>Offline. Showing the last loaded data; changes cannot be saved.</span></> : <><RefreshCw size={17} /><span>JCoins update ready.</span><button type="button" onClick={applyUpdate}>Update</button><button type="button" className="pwa-status-close" onClick={() => setRegistration(null)} aria-label="Update later"><X size={16} /></button></>}
  </div>;
}
