import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import NotificationHost from "./components/NotificationHost.jsx";
import SyncGate from "./components/SyncGate.jsx";
import { setupSync } from "./sync/index.js";
import { runMigrations } from "./utils/migrate.js";
import { registerServiceWorker } from "./pwa/register.js";
import "./index.css";

// Eski ma'lumotlarni yangi sxemaga keltirish (ilova chizilishidan oldin)
runMigrations();

// Bulut sinxronlash (.env.local da Supabase sozlangan bo'lsa)
setupSync();

// Oflayn ishlash va planshetga o'rnatish (faqat production build'da)
if (import.meta.env.PROD) registerServiceWorker();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <SyncGate>
        <App />
      </SyncGate>
    </ErrorBoundary>
    <NotificationHost />
  </StrictMode>
);
