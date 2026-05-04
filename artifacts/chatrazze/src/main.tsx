import { createRoot } from "react-dom/client";
import { Component, type ReactNode } from "react";
import App from "./App";
import { supabaseMisconfigured } from "./lib/supabase";
import "./index.css";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#0a0a0a", color: "#fff", fontFamily: "sans-serif",
          padding: "2rem", textAlign: "center",
        }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Something went wrong</h1>
          <pre style={{
            background: "#1a1a1a", padding: "1rem", borderRadius: "8px",
            fontSize: "0.8rem", color: "#f87171", maxWidth: "600px", overflow: "auto",
          }}>{String((this.state.error as Error).message)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function MissingConfig() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "#0a0a0a", color: "#fff", fontFamily: "sans-serif",
      padding: "2rem", textAlign: "center",
    }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Configuration Missing</h1>
      <p style={{ color: "#9ca3af", marginBottom: "1.5rem" }}>
        These variables are required at build time. After saving them in Cloudflare Pages, trigger a new deployment.
      </p>
      <pre style={{
        background: "#1a1a1a", padding: "1rem", borderRadius: "8px",
        fontSize: "0.9rem", color: "#34d399", textAlign: "left",
      }}>{`VITE_SUPABASE_URL\nVITE_SUPABASE_ANON_KEY`}</pre>
    </div>
  );
}

function isNetworkNoise(reason: unknown): boolean {
  const msg = String(
    (reason as { message?: string })?.message ?? reason ?? "",
  ).toLowerCase();
  return (
    msg.includes("client is offline") ||
    msg.includes("failed to get document because the client is offline") ||
    msg.includes("missing or insufficient permissions") ||
    msg.includes("failed-precondition") ||
    msg.includes("unavailable") ||
    msg.includes("network error")
  );
}

window.addEventListener("unhandledrejection", (e) => {
  if (isNetworkNoise(e.reason)) {
    e.preventDefault();
    console.warn("[chatrazze] suppressed network error:", e.reason);
  }
});

window.addEventListener("error", (e) => {
  if (isNetworkNoise(e.error ?? e.message)) {
    e.preventDefault();
    console.warn("[chatrazze] suppressed network error:", e.error);
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    {supabaseMisconfigured && import.meta.env.PROD ? <MissingConfig /> : <App />}
  </ErrorBoundary>,
);
