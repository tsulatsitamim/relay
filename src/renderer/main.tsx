import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";
import {
  applyAppearance,
  applyHighlightTheme,
  readCachedAppearance,
} from "./theme";

const cached = readCachedAppearance();
applyAppearance(cached, { root: document.documentElement });
applyHighlightTheme(
  document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  document,
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);