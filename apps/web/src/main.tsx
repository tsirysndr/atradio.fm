import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { AppProviders } from "@/providers";
import { router } from "@/router";
import i18n from "@/i18n";
import "@/styles/index.css";

document.documentElement.lang = i18n.language;

// AT Proto OAuth forbids the `localhost` hostname (RFC 8252) — it requires the
// loopback IP `127.0.0.1`. In dev, redirect onto 127.0.0.1 before anything runs
// so the client_id, redirect_uri, and session origin all stay consistent.
if (
  import.meta.env.DEV &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "[::1]")
) {
  window.location.replace(
    window.location.href.replace(
      /\/\/(localhost|\[::1\])/,
      "//127.0.0.1",
    ),
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </React.StrictMode>,
);
