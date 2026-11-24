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
import { startUpdateChecks } from "./pwa/update.js";
import UpdateBanner from "./components/UpdateBanner.jsx";
import "./index.css";

const isQrPage = new URLSearchParams(window.location.search).has("table");

if (!isQrPage) {
  // Eski ma'lumotlarni yangi sxemaga keltirish (ilova chizilishidan oldin)
  runMigrations();
  // Bulut sinxronlash (.env.local da Supabase sozlangan bo'lsa)
  setupSync();
}

// Oflayn ishlash, planshetga o'rnatish va yangi versiyaga avtomatik o'tish (faqat production build'da)
if (import.meta.env.PROD) {
  registerServiceWorker();
  startUpdateChecks({ mode: isQrPage ? "customer" : "staff" });
}

// Mijoz telefonidagi QR-menyu: ?table=3-Stol&k=<stol kaliti> (kirishsiz, alohida kichik ilova)
const qrParams = new URLSearchParams(window.location.search);
const qrTable = qrParams.get("table");
const qrKey = qrParams.get("k") || "";
const root = createRoot(document.getElementById("root"));

if (qrTable) {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <PublicQrApp table={qrTable} tableKey={qrKey} />
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
      <UpdateBanner />
    </StrictMode>
  );
}
