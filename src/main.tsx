import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/design-tokens.css";
import "./index.css";
import { ToastProvider } from "./components/ui/Toast";
import PlatformApp from "./PlatformApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <PlatformApp />
    </ToastProvider>
  </StrictMode>
);
