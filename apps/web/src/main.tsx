import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { reportClientDiagnostic } from "./clientDiagnostics";
import "./styles.css";

reportClientDiagnostic("app-boot", {
  embedded: window.parent !== window
});

window.addEventListener("error", (event) => {
  reportClientDiagnostic("window-error", {
    message: event.message,
    source: event.filename,
    line: event.lineno
  });
});

window.addEventListener("unhandledrejection", (event) => {
  reportClientDiagnostic("unhandled-rejection", {
    reason: event.reason instanceof Error ? event.reason.message : event.reason
  });
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
