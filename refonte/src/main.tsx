import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/bebas-neue";
import "@fontsource-variable/roboto-flex";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/home.css";
import "./styles/play.css";
import "./styles/draft.css";
import "./styles/match.css";
import "./styles/pages.css";
import "./styles/social.css";
import "./styles/settings.css";
import { App } from "./App";
import { startClient } from "./lib/client";

startClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
