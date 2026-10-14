import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { initTelegram } from "./lib/telegram";
import App from "./App";

// The operations console is code-split so customers never download it.
const Admin = lazy(() => import("./admin/Admin"));
const isAdmin = window.location.pathname.startsWith("/admin");

initTelegram();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isAdmin ? <Suspense fallback={null}><Admin /></Suspense> : <App />}
  </StrictMode>
);
