import React, { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { post, request } from "../api.js";

export default function PushNotificationToggle() {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [subscription, setSubscription] = useState(null);
  const [permission, setPermission] = useState(() => supported ? Notification.permission : "unsupported");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supported) return undefined;
    let active = true;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((current) => { if (active) setSubscription(current); })
      .catch(() => {});
    return () => { active = false; };
  }, [supported]);

  if (!supported) return null;

  async function enable() {
    setBusy(true);
    setError("");
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") throw new Error("Notifications were not allowed in browser settings.");
      const config = await request("/push/config");
      if (!config.enabled || !config.publicKey) throw new Error("Push notifications are not available yet.");
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey)
      });
      await post("/push/subscribe", { subscription: current.toJSON() });
      setSubscription(current);
    } catch (requestError) {
      setError(requestError.message || "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!subscription) return;
    setBusy(true);
    setError("");
    try {
      await post("/push/unsubscribe", { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
      setSubscription(null);
    } catch (requestError) {
      setError(requestError.message || "Could not disable notifications.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="push-notification-control">
    <button type="button" className="soft" disabled={busy || permission === "denied"} onClick={subscription ? disable : enable}>
      {subscription ? <BellOff size={16} /> : <BellRing size={16} />}
      {busy ? "Updating..." : permission === "denied" ? "Push blocked" : subscription ? "Disable push" : "Enable push"}
    </button>
    {error && <small className="inline-error">{error}</small>}
  </div>;
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}
