import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import NotificationHost from "./components/NotificationHost.jsx";
import { runMigrations } from "./utils/migrate.js";
import "./index.css";

// Eski ma'lumotlarni yangi sxemaga keltirish (ilova chizilishidan oldin)
runMigrations();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <NotificationHost />
  </StrictMode>
);
