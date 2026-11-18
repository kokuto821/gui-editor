import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./app.css";
import { backend } from "./backend";
import { installKeys } from "./keys";
import { useApp } from "./stores/app";

installKeys();
if (backend.hasToken) void useApp.getState().init(backend);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
