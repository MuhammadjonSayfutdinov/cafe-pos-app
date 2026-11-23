import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import NotificationHost from "./components/NotificationHost.jsx";
import SyncGate from "./components/SyncGate.jsx";
import PublicQrApp from "./qr/PublicQrApp.jsx";
import { setupSync } from "./sync/index.js";
import { runMigrations } from "./utils/migrate.js";
import { registerServiceWorker } from "./pwa/register.js";
import "./index.css";

const isQrPage = new URLSearchParams(window.location.search).has("table");

if (!isQrPage) {
  // Eski ma'lumotlarni yangi sxemaga keltirish (ilova chizilishidan oldin)
  runMigrations();
  // Bulut sinxronlash (.env.local da Supabase sozlangan bo'lsa)
  setupSync();
}

// Oflayn ishlash va planshetga o'rnatish (faqat production build'da)
if (import.meta.env.PROD) registerServiceWorker();

// Mijoz telefonidagi QR-menyu: ?table=3-Stol (kirishsiz, alohida kichik ilova)
const qrTable = new URLSearchParams(window.location.search).get("table");
const root = createRoot(document.getElementById("root"));

if (qrTable) {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <PublicQrApp table={qrTable} />
      </ErrorBoundary>
      <NotificationHost />
    </StrictMode>
  );
} else {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <SyncGate>
          <App />
        </SyncGate>
      </ErrorBoundary>
      <NotificationHost />
    </StrictMode>
  );
}
