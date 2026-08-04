import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Game from "../app/game";
import InstallApp from "../app/install-app";
import PwaRegister from "../app/pwa-register";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Game />
    <InstallApp />
    <PwaRegister />
  </StrictMode>,
);
